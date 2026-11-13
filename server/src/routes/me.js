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

let reservationColumnsReady = false;

async function ensureReservationColumns() {
  if (reservationColumnsReady) return;
  await pool.query(`
    ALTER TABLE reservation
      ADD COLUMN IF NOT EXISTS amount NUMERIC(8,2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS method VARCHAR(10),
      ADD COLUMN IF NOT EXISTS txn_ref VARCHAR(20),
      ADD COLUMN IF NOT EXISTS paid_by INT
  `);
  reservationColumnsReady = true;
}

async function cleanExpiredReservations() {
  try {
    await ensureReservationColumns();
    await pool.query(`DELETE FROM reservation WHERE expires_at < now()`);
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Vehicles & Plan Management
// ---------------------------------------------------------------------------

router.get(
  '/me/vehicles',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT
         v.plate_no AS plate,
         vt.type_name AS type,
         CASE v.plan
           WHEN 'MONTHLY' THEN 'Monthly pass'
           WHEN 'PAY_PER_HOUR' THEN 'Pay per hour'
           WHEN 'VISITOR' THEN 'Visitor'
           ELSE v.plan
         END AS plan,
         v.plan AS "rawPlan",
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
       GROUP BY v.plate_no, vt.type_name, v.plan, t.first_hour, t.extra_hour, v.registered_at
       ORDER BY v.registered_at DESC`,
      [req.user.ownerId]
    );
    res.json(
      rows.map((r) => ({
        ...r,
        firstHour: Number(r.firstHour),
        extraHour: Number(r.extraHour),
        monthlyPrice: MONTHLY_PASS_PRICES[r.type] || 1299
      }))
    );
  })
);

router.post(
  '/me/vehicles',
  asyncHandler(async (req, res) => {
    const plate = normalizePlate(req.body && req.body.plate);
    const typeName = String((req.body && req.body.type) || 'Car').trim();
    const rawPlan = String((req.body && req.body.plan) || 'PAY_PER_HOUR').trim();

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

    const planMap = {
      'Monthly pass': 'MONTHLY',
      'Pay per hour': 'PAY_PER_HOUR',
      MONTHLY: 'MONTHLY',
      PAY_PER_HOUR: 'PAY_PER_HOUR'
    };
    const targetPlan = planMap[rawPlan] || 'PAY_PER_HOUR';

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const existing = await client.query(
        `SELECT plate_no, owner_id FROM vehicle WHERE plate_no = $1`,
        [plate]
      );
      if (existing.rows.length > 0) {
        if (existing.rows[0].owner_id === req.user.ownerId) {
          throw new HttpError(409, 'This vehicle is already registered to your account.');
        } else {
          throw new HttpError(409, 'This plate number is already registered.');
        }
      }

      await client.query(
        `INSERT INTO vehicle (plate_no, type_id, owner_id, plan)
         VALUES ($1, $2, $3, $4)`,
        [plate, typeId, req.user.ownerId, targetPlan]
      );

      await client.query('COMMIT');

      res.status(201).json({
        plate,
        type: typeRes.rows[0].type_name,
        plan: targetPlan === 'MONTHLY' ? 'Monthly pass' : 'Pay per hour',
        rawPlan: targetPlan,
        visits: 0,
        inLot: false,
        slot: null
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  })
);

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
      throw new HttpError(422, 'Invalid plan. Choose Monthly pass or Pay per hour.');
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

    if (targetPlan === 'MONTHLY') {
      const rawMethod = String((req.body && req.body.method) || 'UPI')
        .trim()
        .toUpperCase();
      if (!['UPI', 'CARD'].includes(rawMethod)) {
        throw new HttpError(422, 'Choose UPI or Card to pay.');
      }

      const simulate = String((req.body && req.body.simulate) || 'success')
        .trim()
        .toLowerCase();

      const delayMs = process.env.NODE_ENV === 'test' ? 150 : 1200;
      await new Promise((resolve) => setTimeout(resolve, delayMs));

      if (simulate === 'fail') {
        return res
          .status(402)
          .json({ error: 'Payment failed. Please try again.' });
      }

      const amount = MONTHLY_PASS_PRICES[vehType] || 1299;
      const txnRef =
        'SIM-' + Math.floor(100000 + Math.random() * 900000).toString();

      await pool.query(
        `UPDATE vehicle
            SET plan = 'MONTHLY'
          WHERE plate_no = $1 AND owner_id = $2`,
        [plate, req.user.ownerId]
      );

      return res.json({
        plate,
        type: vehType,
        plan: 'Monthly pass',
        rawPlan: 'MONTHLY',
        amount,
        method: rawMethod,
        txnRef,
        paidAt: new Date().toISOString(),
        message: `Subscribed ${plate} to Monthly pass.`
      });
    }

    await pool.query(
      `UPDATE vehicle
          SET plan = 'PAY_PER_HOUR'
        WHERE plate_no = $1 AND owner_id = $2`,
      [plate, req.user.ownerId]
    );

    res.json({
      plate,
      type: vehType,
      plan: 'Pay per hour',
      rawPlan: 'PAY_PER_HOUR',
      message: `Plan updated to Pay per hour.`
    });
  })
);

// ---------------------------------------------------------------------------
// Advance Booking (Reservations)
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
         GREATEST(0, ROUND(EXTRACT(EPOCH FROM (r.expires_at - now())) / 60))::INT AS "minutesRemaining"
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
        method: r.method || 'UPI',
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
    const rawMethod = String((req.body && req.body.method) || 'UPI').trim().toUpperCase();
    const simulate = String((req.body && req.body.simulate) || 'success').trim().toLowerCase();

    if (!plate) {
      throw new HttpError(422, 'Select a vehicle plate.');
    }
    if (!['UPI', 'CARD'].includes(rawMethod)) {
      throw new HttpError(422, 'Choose UPI or Card to pay for the booking.');
    }

    const vehCheck = await pool.query(
      `SELECT v.plate_no, v.type_id, vt.type_name, v.plan, t.first_hour, t.extra_hour
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
    const hours = Math.max(1, Math.ceil(holdMinutes / 60));
    const bookingFee =
      Number(veh.first_hour) + (hours - 1) * Number(veh.extra_hour);

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
      throw new HttpError(409, 'You already have an active advance booking for this vehicle.');
    }

    // Simulated payment gateway delay
    const delayMs = process.env.NODE_ENV === 'test' ? 150 : 1200;
    await new Promise((resolve) => setTimeout(resolve, delayMs));

    if (simulate === 'fail') {
      return res
        .status(402)
        .json({ error: 'Payment failed. Please try again.' });
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
          throw new HttpError(409, 'That slot is not available. Please choose another.');
        }
        chosenSlot = slotRes.rows[0];
      } else {
        let floorId = null;
        if (floorArg && floorArg !== 'Any') {
          const floorRes = await client.query(
            `SELECT floor_id FROM floor WHERE code = $1 OR floor_name = $1 OR floor_name ILIKE $1 || '%' LIMIT 1`,
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
          throw new HttpError(409, 'No free slot available matching your preference. Try another floor or slot kind.');
        }
        chosenSlot = slotRes.rows[0];
      }

      const txnRef =
        'SIM-' + Math.floor(100000 + Math.random() * 900000).toString();

      const insRes = await client.query(
        `INSERT INTO reservation (plate_no, slot_id, expires_at, amount, method, txn_ref, paid_by)
         VALUES ($1, $2, now() + ($3 || ' minutes')::INTERVAL, $4, $5, $6, $7)
         RETURNING reservation_id, created_at, expires_at`,
        [plate, chosenSlot.slot_id, holdMinutes, bookingFee, rawMethod, txnRef, req.user.id]
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
        method: rawMethod,
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

router.delete(
  '/me/reservations/:id',
  asyncHandler(async (req, res) => {
    const resId = Number(req.params.id);
    if (!Number.isInteger(resId) || resId <= 0) {
      throw new HttpError(404, 'Reservation not found.');
    }

    const { rows } = await pool.query(
      `SELECT r.reservation_id, r.plate_no, s.slot_code
       FROM reservation r
       JOIN vehicle v ON v.plate_no = r.plate_no
       JOIN slot s ON s.slot_id = r.slot_id
       WHERE r.reservation_id = $1 AND v.owner_id = $2`,
      [resId, req.user.ownerId]
    );

    if (rows.length === 0) {
      throw new HttpError(404, 'Reservation not found.');
    }

    await pool.query(`DELETE FROM reservation WHERE reservation_id = $1`, [resId]);

    res.json({
      ok: true,
      message: `Reservation for ${rows[0].plate_no} (slot ${rows[0].slot_code}) cancelled.`
    });
  })
);

// ---------------------------------------------------------------------------
// Active Sessions & Self-Pay Exit
// ---------------------------------------------------------------------------

router.get(
  '/me/sessions/active',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT
         session_id AS id,
         plate_no AS plate,
         type_name AS type,
         slot_code AS slot,
         floor_name AS floor,
         entry_time AS "enteredAt",
         minutes_parked AS minutes,
         fee
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
        fee: Number(r.fee)
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

    const rawMethod = String((req.body && req.body.method) || 'UPI')
      .trim()
      .toUpperCase();
    if (!['UPI', 'CARD'].includes(rawMethod)) {
      throw new HttpError(422, 'That value is not allowed.');
    }

    const simulate = String((req.body && req.body.simulate) || 'success')
      .trim()
      .toLowerCase();

    // Simulated gateway delay (~1.5s)
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const sessionRes = await client.query(
        `SELECT ps.session_id, ps.plate_no, ps.slot_id, ps.exit_time, s.slot_code
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

      if (simulate === 'fail') {
        await client.query('SAVEPOINT before_pay');
        await client.query('ROLLBACK TO SAVEPOINT before_pay');

        await client.query(
          `INSERT INTO payment_attempt (session_id, method, outcome, made_by)
           VALUES ($1, $2, 'FAILED', $3)`,
          [sessionId, rawMethod, req.user.id]
        );

        await client.query('COMMIT');
        return res
          .status(402)
          .json({ error: 'Payment failed. Please try again.' });
      }

      await client.query(
        `INSERT INTO payment_attempt (session_id, method, outcome, made_by)
         VALUES ($1, $2, 'SUCCESS', $3)`,
        [sessionId, rawMethod, req.user.id]
      );

      await client.query(
        `UPDATE parking_session ps
            SET exit_time = GREATEST(now(), ps.entry_time + INTERVAL '1 millisecond')
           FROM vehicle v
          WHERE ps.session_id = $1
            AND ps.plate_no = v.plate_no
            AND v.owner_id = $2
            AND ps.exit_time IS NULL`,
        [sessionId, req.user.ownerId]
      );

      const txnRef =
        'SIM-' + Math.floor(100000 + Math.random() * 900000).toString();

      const payRes = await client.query(
        `UPDATE payment
            SET status = 'PAID',
                method = $2,
                paid_at = now(),
                paid_by = $3,
                txn_ref = $4
          WHERE session_id = $1
          RETURNING amount, method, txn_ref, paid_at`,
        [sessionId, rawMethod, req.user.id, txnRef]
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
