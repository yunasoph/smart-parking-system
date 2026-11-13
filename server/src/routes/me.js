const express = require('express');
const pool = require('../db');
const { HttpError, asyncHandler, normalizePlate } = require('../errors');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use('/me', requireAuth, requireRole('PARKER'));

const MONTHLY_PASS_PRICES = {
  Bike: 499,
  Car: 1299,
  SUV: 1799
};
const PASS_DAYS = 30;

function simulatedDelay() {
  const ms = process.env.NODE_ENV === 'test' ? 150 : 1200;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function newTxnRef() {
  return 'SIM-' + Math.floor(100000 + Math.random() * 900000).toString();
}

function readOnlineMethod(body) {
  const method = String((body && body.method) || 'UPI').trim().toUpperCase();
  if (!['UPI', 'CARD'].includes(method)) {
    throw new HttpError(422, 'Choose UPI or Card to pay.');
  }
  return method;
}

function wantsFailure(body) {
  return String((body && body.simulate) || 'success').trim().toLowerCase() === 'fail';
}

// Expired holds are released (slot freed by trigger) and the booking payment is
// marked as forfeited in the ledger, all in one statement.
async function cleanExpiredReservations(db = pool) {
  await db.query(
    `WITH gone AS (
       DELETE FROM reservation
        WHERE expires_at < now()
        RETURNING txn_ref
     )
     UPDATE online_payment op
        SET status = 'EXPIRED'
       FROM gone
      WHERE op.txn_ref = gone.txn_ref
        AND op.status = 'PAID'`
  );
}

// A plate first seen at the gate is filed under the shared "Visitor" owner.
// When its real owner signs up, they may take it over.
async function claimOrCheckPlate(client, plate, ownerId) {
  const existing = await client.query(
    `SELECT v.owner_id, o.full_name, o.phone
       FROM vehicle v
       JOIN owner o ON o.owner_id = v.owner_id
      WHERE v.plate_no = $1
      FOR UPDATE OF v`,
    [plate]
  );
  if (existing.rows.length === 0) return 'new';
  const row = existing.rows[0];
  if (row.owner_id === ownerId) return 'mine';
  if (row.full_name === 'Visitor' && row.phone === '9999999999') {
    await client.query(
      `UPDATE vehicle
          SET owner_id = $1,
              plan = CASE WHEN plan = 'VISITOR' THEN 'PAY_PER_HOUR' ELSE plan END
        WHERE plate_no = $2`,
      [ownerId, plate]
    );
    return 'claimed';
  }
  return 'taken';
}

// ---------------------------------------------------------------------------
// Vehicles
// ---------------------------------------------------------------------------

router.get(
  '/me/vehicles',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT
         v.plate_no AS plate,
         vt.type_name AS type,
         v.plan AS "rawPlan",
         v.pass_valid_until AS "passValidUntil",
         (v.plan = 'MONTHLY' AND (v.pass_valid_until IS NULL OR v.pass_valid_until >= now())) AS "passActive",
         t.first_hour AS "firstHour",
         t.extra_hour AS "extraHour",
         COUNT(ps.session_id)::INT AS visits,
         BOOL_OR(ps.session_id IS NOT NULL AND ps.exit_time IS NULL) AS "inLot",
         MAX(s.slot_code) FILTER (WHERE ps.session_id IS NOT NULL AND ps.exit_time IS NULL) AS slot
       FROM vehicle v
       JOIN vehicle_type vt ON vt.type_id = v.type_id
       JOIN tariff t ON t.type_id = v.type_id
       LEFT JOIN parking_session ps ON ps.plate_no = v.plate_no
       LEFT JOIN slot s ON s.slot_id = ps.slot_id
       WHERE v.owner_id = $1
       GROUP BY v.plate_no, vt.type_name, v.plan, v.pass_valid_until,
                t.first_hour, t.extra_hour, v.registered_at
       ORDER BY v.registered_at DESC`,
      [req.user.ownerId]
    );
    res.json(
      rows.map((r) => {
        let plan = 'Pay per hour';
        if (r.rawPlan === 'MONTHLY') plan = r.passActive ? 'Monthly pass' : 'Pass expired';
        else if (r.rawPlan === 'VISITOR') plan = 'Visitor';
        return {
          plate: r.plate,
          type: r.type,
          plan,
          rawPlan: r.rawPlan,
          passActive: Boolean(r.passActive),
          passValidUntil: r.passValidUntil ? new Date(r.passValidUntil).toISOString() : null,
          firstHour: Number(r.firstHour),
          extraHour: Number(r.extraHour),
          monthlyPrice: MONTHLY_PASS_PRICES[r.type] || 1299,
          visits: r.visits,
          inLot: Boolean(r.inLot),
          slot: r.slot
        };
      })
    );
  })
);

router.post(
  '/me/vehicles',
  asyncHandler(async (req, res) => {
    const plate = normalizePlate(req.body && req.body.plate);
    const typeName = String((req.body && req.body.type) || 'Car').trim();

    if (!plate) {
      throw new HttpError(422, 'Enter the plate number.');
    }

    const typeRes = await pool.query(
      `SELECT type_id, type_name FROM vehicle_type WHERE type_name = $1`,
      [typeName]
    );
    if (typeRes.rows.length === 0) {
      throw new HttpError(422, 'That vehicle type is not allowed.');
    }
    const typeId = typeRes.rows[0].type_id;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const state = await claimOrCheckPlate(client, plate, req.user.ownerId);
      if (state === 'mine') {
        throw new HttpError(409, 'This vehicle is already registered to your account.');
      }
      if (state === 'taken') {
        throw new HttpError(409, 'This plate number is already registered.');
      }
      if (state === 'new') {
        await client.query(
          `INSERT INTO vehicle (plate_no, type_id, owner_id, plan)
           VALUES ($1, $2, $3, 'PAY_PER_HOUR')`,
          [plate, typeId, req.user.ownerId]
        );
      }

      const vehRes = await client.query(
        `SELECT vt.type_name FROM vehicle v
           JOIN vehicle_type vt ON vt.type_id = v.type_id
          WHERE v.plate_no = $1`,
        [plate]
      );

      await client.query('COMMIT');

      res.status(201).json({
        plate,
        type: vehRes.rows[0].type_name,
        plan: 'Pay per hour',
        rawPlan: 'PAY_PER_HOUR',
        claimed: state === 'claimed'
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  })
);

// ---------------------------------------------------------------------------
// Subscription plan (monthly pass)
// ---------------------------------------------------------------------------

router.patch(
  '/me/vehicles/:plate/plan',
  asyncHandler(async (req, res) => {
    const plate = normalizePlate(req.params.plate);
    const rawPlan = String((req.body && req.body.plan) || '').trim();
    const planMap = {
      'Monthly pass': 'MONTHLY',
      'Pay per hour': 'PAY_PER_HOUR',
      MONTHLY: 'MONTHLY',
      PAY_PER_HOUR: 'PAY_PER_HOUR'
    };
    const targetPlan = planMap[rawPlan];
    if (!targetPlan) {
      throw new HttpError(422, 'Choose Monthly pass or Pay per hour.');
    }

    const vehRes = await pool.query(
      `SELECT v.plate_no, vt.type_name AS type
         FROM vehicle v
         JOIN vehicle_type vt ON vt.type_id = v.type_id
        WHERE v.plate_no = $1 AND v.owner_id = $2`,
      [plate, req.user.ownerId]
    );
    if (vehRes.rows.length === 0) {
      throw new HttpError(404, 'Vehicle not found on your account.');
    }
    const vehType = vehRes.rows[0].type;

    if (targetPlan === 'PAY_PER_HOUR') {
      await pool.query(
        `UPDATE vehicle
            SET plan = 'PAY_PER_HOUR', pass_valid_until = NULL
          WHERE plate_no = $1 AND owner_id = $2`,
        [plate, req.user.ownerId]
      );
      return res.json({
        plate,
        type: vehType,
        plan: 'Pay per hour',
        rawPlan: 'PAY_PER_HOUR',
        message: `${plate} is now on Pay per hour.`
      });
    }

    // Buying (or renewing) a monthly pass requires payment
    const method = readOnlineMethod(req.body);
    await simulatedDelay();
    if (wantsFailure(req.body)) {
      return res.status(402).json({ error: 'Payment failed. Please try again.' });
    }

    const amount = MONTHLY_PASS_PRICES[vehType] || 1299;
    const txnRef = newTxnRef();

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // A renewal extends from the current end date; a new pass starts now.
      const upd = await client.query(
        `UPDATE vehicle
            SET plan = 'MONTHLY',
                pass_valid_until =
                  CASE WHEN plan = 'MONTHLY' AND pass_valid_until > now()
                       THEN pass_valid_until
                       ELSE now()
                  END + ($3 || ' days')::INTERVAL
          WHERE plate_no = $1 AND owner_id = $2
          RETURNING pass_valid_until`,
        [plate, req.user.ownerId, PASS_DAYS]
      );
      const validUntil = upd.rows[0].pass_valid_until;

      const ins = await client.query(
        `INSERT INTO online_payment (kind, plate_no, amount, method, txn_ref, paid_by, valid_until)
         VALUES ('PASS', $1, $2, $3, $4, $5, $6)
         RETURNING created_at`,
        [plate, amount, method, txnRef, req.user.id, validUntil]
      );

      await client.query('COMMIT');

      res.json({
        plate,
        type: vehType,
        plan: 'Monthly pass',
        rawPlan: 'MONTHLY',
        amount,
        method,
        txnRef,
        validUntil: new Date(validUntil).toISOString(),
        paidAt: new Date(ins.rows[0].created_at).toISOString(),
        message: `Monthly pass active for ${plate}.`
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  })
);

// ---------------------------------------------------------------------------
// Online payments ledger (bookings and passes)
// ---------------------------------------------------------------------------

router.get(
  '/me/payments',
  asyncHandler(async (req, res) => {
    await cleanExpiredReservations();
    const { rows } = await pool.query(
      `SELECT op.online_payment_id AS id, op.kind, op.plate_no AS plate,
              op.amount, op.method, op.status, op.txn_ref AS "txnRef",
              op.valid_until AS "validUntil", op.created_at AS "createdAt",
              s.slot_code AS slot
         FROM online_payment op
         JOIN vehicle v ON v.plate_no = op.plate_no
         LEFT JOIN slot s ON s.slot_id = op.slot_id
        WHERE v.owner_id = $1
        ORDER BY op.created_at DESC
        LIMIT 50`,
      [req.user.ownerId]
    );
    res.json(
      rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        plate: r.plate,
        slot: r.slot,
        amount: Number(r.amount),
        method: r.method,
        status: r.status,
        txnRef: r.txnRef,
        validUntil: r.validUntil ? new Date(r.validUntil).toISOString() : null,
        createdAt: new Date(r.createdAt).toISOString()
      }))
    );
  })
);

// ---------------------------------------------------------------------------
// Advance booking (reservations)
// ---------------------------------------------------------------------------

router.get(
  '/me/reservations',
  asyncHandler(async (req, res) => {
    await cleanExpiredReservations();
    const { rows } = await pool.query(
      `SELECT
         r.reservation_id AS id,
         r.plate_no AS plate,
         vt.type_name AS type,
         s.slot_code AS slot,
         s.kind AS kind,
         f.floor_name AS floor,
         f.code AS "floorCode",
         r.amount,
         r.method,
         r.txn_ref AS "txnRef",
         r.created_at AS "createdAt",
         r.expires_at AS "expiresAt",
         GREATEST(0, CEIL(EXTRACT(EPOCH FROM (r.expires_at - now())) / 60))::INT AS "minutesRemaining"
       FROM reservation r
       JOIN slot s ON s.slot_id = r.slot_id
       JOIN floor f ON f.floor_id = s.floor_id
       JOIN vehicle v ON v.plate_no = r.plate_no
       JOIN vehicle_type vt ON vt.type_id = v.type_id
       WHERE v.owner_id = $1
       ORDER BY r.created_at DESC`,
      [req.user.ownerId]
    );

    res.json(
      rows.map((r) => ({
        id: r.id,
        ticketNo: 'RES-' + r.id,
        plate: r.plate,
        type: r.type,
        slot: r.slot,
        kind: r.kind,
        floor: r.floor,
        floorCode: r.floorCode,
        amount: Number(r.amount || 0),
        method: r.method,
        txnRef: r.txnRef || null,
        createdAt: new Date(r.createdAt).toISOString(),
        expiresAt: new Date(r.expiresAt).toISOString(),
        minutesRemaining: Number(r.minutesRemaining)
      }))
    );
  })
);

router.get(
  '/me/available-slots',
  asyncHandler(async (_req, res) => {
    await cleanExpiredReservations();
    const { rows } = await pool.query(
      `SELECT
         s.slot_id AS id,
         s.slot_code AS code,
         s.slot_no AS "slotNo",
         s.kind,
         f.floor_id AS "floorId",
         f.floor_name AS "floorName",
         f.code AS "floorCode"
       FROM slot s
       JOIN floor f ON f.floor_id = s.floor_id
       WHERE s.status = 'FREE'
       ORDER BY f.floor_id, (CASE WHEN s.kind = 'REGULAR' THEN 0 ELSE 1 END), s.slot_no`
    );
    res.json(rows);
  })
);

router.post(
  '/me/reservations',
  asyncHandler(async (req, res) => {
    await cleanExpiredReservations();

    const plate = normalizePlate(req.body && req.body.plate);
    const floorArg = String((req.body && req.body.floor) || 'Any').trim();
    const kindArg = String((req.body && req.body.kind) || 'ANY').trim().toUpperCase();
    const slotCodeArg = String((req.body && req.body.slotCode) || '').trim();
    const holdMinutes = Math.min(180, Math.max(15, Number(req.body && req.body.holdMinutes) || 30));

    if (!plate) {
      throw new HttpError(422, 'Select a vehicle plate.');
    }
    const method = readOnlineMethod(req.body);

    const vehCheck = await pool.query(
      `SELECT v.plate_no, vt.type_name, t.first_hour, t.extra_hour
         FROM vehicle v
         JOIN vehicle_type vt ON vt.type_id = v.type_id
         JOIN tariff t ON t.type_id = v.type_id
        WHERE v.plate_no = $1 AND v.owner_id = $2`,
      [plate, req.user.ownerId]
    );
    if (vehCheck.rows.length === 0) {
      throw new HttpError(403, 'That vehicle is not registered to your account.');
    }
    const veh = vehCheck.rows[0];

    // Booking fee = the hourly tariff for the hold window. It is credited
    // against the parking fee when the vehicle arrives.
    const hours = Math.max(1, Math.ceil(holdMinutes / 60));
    const bookingFee = Number(veh.first_hour) + (hours - 1) * Number(veh.extra_hour);

    const openSession = await pool.query(
      `SELECT 1 FROM parking_session WHERE plate_no = $1 AND exit_time IS NULL`,
      [plate]
    );
    if (openSession.rows.length > 0) {
      throw new HttpError(409, 'That vehicle is already parked in the lot.');
    }

    const existingRes = await pool.query(
      `SELECT 1 FROM reservation WHERE plate_no = $1 AND expires_at > now()`,
      [plate]
    );
    if (existingRes.rows.length > 0) {
      throw new HttpError(409, 'You already have an active booking for this vehicle.');
    }

    await simulatedDelay();
    if (wantsFailure(req.body)) {
      return res.status(402).json({ error: 'Payment failed. Please try again.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      let chosenSlot;
      if (slotCodeArg) {
        const slotRes = await client.query(
          `SELECT s.slot_id, s.slot_code, s.kind, f.floor_name, f.code AS floor_code
             FROM slot s
             JOIN floor f ON f.floor_id = s.floor_id
            WHERE s.slot_code = $1 AND s.status = 'FREE'
            LIMIT 1
            FOR UPDATE OF s SKIP LOCKED`,
          [slotCodeArg]
        );
        if (slotRes.rows.length === 0) {
          throw new HttpError(409, 'That slot was just taken. Please choose another.');
        }
        chosenSlot = slotRes.rows[0];
      } else {
        let floorId = null;
        if (floorArg && floorArg !== 'Any') {
          const floorRes = await client.query(
            `SELECT floor_id FROM floor WHERE code = $1 OR floor_name = $1 LIMIT 1`,
            [floorArg]
          );
          if (floorRes.rows.length === 0) {
            throw new HttpError(422, 'That floor is not allowed.');
          }
          floorId = floorRes.rows[0].floor_id;
        }
        const kindFilter = ['REGULAR', 'EV', 'ACCESSIBLE'].includes(kindArg) ? kindArg : null;

        const slotRes = await client.query(
          `SELECT s.slot_id, s.slot_code, s.kind, f.floor_name, f.code AS floor_code
             FROM slot s
             JOIN floor f ON f.floor_id = s.floor_id
            WHERE s.status = 'FREE'
              AND ($1::INT IS NULL OR s.floor_id = $1)
              AND ($2::TEXT IS NULL OR s.kind = $2)
            ORDER BY (CASE WHEN s.kind = 'REGULAR' THEN 0 ELSE 1 END), s.floor_id, s.slot_no
            LIMIT 1
            FOR UPDATE OF s SKIP LOCKED`,
          [floorId, kindFilter]
        );
        if (slotRes.rows.length === 0) {
          throw new HttpError(409, 'No free slot matches your choice. Try another floor or bay type.');
        }
        chosenSlot = slotRes.rows[0];
      }

      const txnRef = newTxnRef();

      await client.query(
        `INSERT INTO online_payment (kind, plate_no, slot_id, amount, method, txn_ref, paid_by)
         VALUES ('BOOKING', $1, $2, $3, $4, $5, $6)`,
        [plate, chosenSlot.slot_id, bookingFee, method, txnRef, req.user.id]
      );

      const insRes = await client.query(
        `INSERT INTO reservation (plate_no, slot_id, expires_at, amount, method, txn_ref, paid_by)
         VALUES ($1, $2, now() + ($3 || ' minutes')::INTERVAL, $4, $5, $6, $7)
         RETURNING reservation_id, created_at, expires_at`,
        [plate, chosenSlot.slot_id, holdMinutes, bookingFee, method, txnRef, req.user.id]
      );

      await client.query('COMMIT');

      const created = insRes.rows[0];
      res.status(201).json({
        id: created.reservation_id,
        ticketNo: 'RES-' + created.reservation_id,
        plate,
        type: veh.type_name,
        slot: chosenSlot.slot_code,
        kind: chosenSlot.kind,
        floor: chosenSlot.floor_name,
        floorCode: chosenSlot.floor_code,
        holdMinutes,
        amount: bookingFee,
        method,
        txnRef,
        createdAt: new Date(created.created_at).toISOString(),
        expiresAt: new Date(created.expires_at).toISOString(),
        minutesRemaining: holdMinutes
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  })
);

// Cancelling before the hold ends releases the bay and refunds the booking fee.
router.delete(
  '/me/reservations/:id',
  asyncHandler(async (req, res) => {
    const resId = Number(req.params.id);
    if (!Number.isInteger(resId) || resId <= 0) {
      throw new HttpError(404, 'Booking not found.');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query(
        `DELETE FROM reservation r
          USING vehicle v, slot s
          WHERE r.reservation_id = $1
            AND v.plate_no = r.plate_no
            AND s.slot_id = r.slot_id
            AND v.owner_id = $2
            AND r.expires_at > now()
          RETURNING r.plate_no, r.amount, r.txn_ref, s.slot_code`,
        [resId, req.user.ownerId]
      );
      if (rows.length === 0) {
        throw new HttpError(404, 'Booking not found.');
      }

      const cancelled = rows[0];
      if (cancelled.txn_ref) {
        await client.query(
          `UPDATE online_payment SET status = 'REFUNDED'
            WHERE txn_ref = $1 AND status = 'PAID'`,
          [cancelled.txn_ref]
        );
      }

      await client.query('COMMIT');

      res.json({
        ok: true,
        refunded: Number(cancelled.amount || 0),
        message: `Booking for ${cancelled.plate_no} (slot ${cancelled.slot_code}) cancelled.`
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  })
);

// ---------------------------------------------------------------------------
// Active sessions, history and pay-and-exit
// ---------------------------------------------------------------------------

router.get(
  '/me/sessions/active',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT session_id AS id, plate_no AS plate, type_name AS type,
              slot_code AS slot, floor_name AS floor, entry_time AS "enteredAt",
              minutes_parked AS minutes, fee, prepaid_amount AS prepaid
         FROM v_my_sessions
        WHERE owner_id = $1
          AND exit_time IS NULL
        ORDER BY entry_time DESC`,
      [req.user.ownerId]
    );

    res.json(
      rows.map((r) => ({
        id: r.id,
        plate: r.plate,
        type: r.type,
        slot: r.slot,
        floor: r.floor,
        enteredAt: new Date(r.enteredAt).toISOString(),
        minutes: Number(r.minutes),
        fee: Number(r.fee),
        prepaid: Number(r.prepaid || 0)
      }))
    );
  })
);

router.get(
  '/me/sessions/history',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT
         vms.session_id AS id,
         vms.plate_no AS plate,
         vms.type_name AS type,
         vms.slot_code AS slot,
         vms.floor_name AS floor,
         vms.entry_time AS "enteredAt",
         vms.exit_time AS "exitedAt",
         vms.minutes_parked AS minutes,
         vms.fee AS amount,
         vms.prepaid_amount AS prepaid,
         CASE vms.payment_status
           WHEN 'PAID' THEN 'Paid'
           WHEN 'PENDING' THEN 'Pending'
           WHEN 'FAILED' THEN 'Failed'
           ELSE vms.payment_status
         END AS status,
         p.txn_ref AS "txnRef"
       FROM v_my_sessions vms
       LEFT JOIN payment p ON p.session_id = vms.session_id
       WHERE vms.owner_id = $1
         AND vms.exit_time IS NOT NULL
       ORDER BY vms.exit_time DESC
       LIMIT 50`,
      [req.user.ownerId]
    );

    res.json(
      rows.map((r) => ({
        id: r.id,
        plate: r.plate,
        type: r.type,
        slot: r.slot,
        floor: r.floor,
        enteredAt: new Date(r.enteredAt).toISOString(),
        exitedAt: new Date(r.exitedAt).toISOString(),
        minutes: Number(r.minutes),
        amount: Number(r.amount),
        prepaid: Number(r.prepaid || 0),
        status: r.status,
        txnRef: r.txnRef || null
      }))
    );
  })
);

router.post(
  '/me/sessions/:id/pay',
  asyncHandler(async (req, res) => {
    const sessionId = Number(req.params.id);
    if (!Number.isInteger(sessionId) || sessionId <= 0) {
      throw new HttpError(404, 'Parking session not found.');
    }
    const method = readOnlineMethod(req.body);
    const fail = wantsFailure(req.body);

    // Simulated gateway delay (~1.5s)
    await new Promise((resolve) =>
      setTimeout(resolve, process.env.NODE_ENV === 'test' ? 150 : 1500)
    );

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const sessionRes = await client.query(
        `SELECT ps.session_id, ps.plate_no, ps.exit_time, s.slot_code
           FROM parking_session ps
           JOIN vehicle v ON v.plate_no = ps.plate_no
           JOIN slot s    ON s.slot_id  = ps.slot_id
          WHERE ps.session_id = $1
            AND v.owner_id = $2
          FOR UPDATE OF ps`,
        [sessionId, req.user.ownerId]
      );
      if (sessionRes.rows.length === 0) {
        throw new HttpError(404, 'Parking session not found.');
      }
      const session = sessionRes.rows[0];
      if (session.exit_time !== null) {
        throw new HttpError(409, 'This parking session is already closed.');
      }

      if (fail) {
        // Only the failed attempt is recorded; the session stays open.
        await client.query(
          `INSERT INTO payment_attempt (session_id, method, outcome, made_by)
           VALUES ($1, $2, 'FAILED', $3)`,
          [sessionId, method, req.user.id]
        );
        await client.query('COMMIT');
        return res.status(402).json({ error: 'Payment failed. Please try again.' });
      }

      await client.query(
        `INSERT INTO payment_attempt (session_id, method, outcome, made_by)
         VALUES ($1, $2, 'SUCCESS', $3)`,
        [sessionId, method, req.user.id]
      );

      // Closing the session fires the triggers that free the slot and create the bill
      await client.query(
        `UPDATE parking_session
            SET exit_time = GREATEST(now(), entry_time + INTERVAL '1 millisecond')
          WHERE session_id = $1 AND exit_time IS NULL`,
        [sessionId]
      );

      const payRes = await client.query(
        `UPDATE payment
            SET status = 'PAID', method = $2, paid_at = now(), paid_by = $3, txn_ref = $4
          WHERE session_id = $1
          RETURNING amount, method, txn_ref, paid_at`,
        [sessionId, method, req.user.id, newTxnRef()]
      );

      await client.query('COMMIT');

      const paid = payRes.rows[0];
      res.json({
        amount: Number(paid.amount),
        method: paid.method,
        txnRef: paid.txn_ref,
        slot: session.slot_code,
        plate: session.plate_no,
        paidAt: new Date(paid.paid_at).toISOString()
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  })
);

module.exports = router;
