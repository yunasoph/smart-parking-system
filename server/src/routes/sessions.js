const express = require('express');
const pool = require('../db');
const { HttpError, asyncHandler, normalizePlate } = require('../errors');

const router = express.Router();

router.post(
  '/entry',
  asyncHandler(async (req, res) => {
    const plate = normalizePlate(req.body && req.body.plate);
    const typeName = String((req.body && req.body.type) || 'Car').trim();
    const floorArg = String((req.body && req.body.floor) || 'Any').trim();

    if (!plate) {
      throw new HttpError(422, 'Enter the plate number to continue.');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const typeRes = await client.query(
        `SELECT type_id FROM vehicle_type WHERE type_name = $1`,
        [typeName]
      );
      if (typeRes.rows.length === 0) {
        throw new HttpError(422, 'That value is not allowed.');
      }
      const requestedTypeId = typeRes.rows[0].type_id;

      let vehRes = await client.query(
        `SELECT plate_no, type_id FROM vehicle WHERE plate_no = $1`,
        [plate]
      );

      let vehicleTypeId;
      if (vehRes.rows.length === 0) {
        let ownerRes = await client.query(
          `SELECT owner_id FROM owner WHERE full_name = 'Visitor' LIMIT 1`
        );
        let visitorOwnerId;
        if (ownerRes.rows.length === 0) {
          const insOwner = await client.query(
            `INSERT INTO owner (full_name, phone)
             VALUES ('Visitor', '9999999999')
             ON CONFLICT (phone) DO UPDATE SET full_name = EXCLUDED.full_name
             RETURNING owner_id`
          );
          visitorOwnerId = insOwner.rows[0].owner_id;
        } else {
          visitorOwnerId = ownerRes.rows[0].owner_id;
        }

        const insVeh = await client.query(
          `INSERT INTO vehicle (plate_no, type_id, owner_id, plan)
           VALUES ($1, $2, $3, 'VISITOR')
           ON CONFLICT (plate_no) DO UPDATE SET plate_no = EXCLUDED.plate_no
           RETURNING type_id`,
          [plate, requestedTypeId, visitorOwnerId]
        );
        vehicleTypeId = insVeh.rows[0].type_id;
      } else {
        vehicleTypeId = vehRes.rows[0].type_id;
      }

      const openCheck = await client.query(
        `SELECT 1 FROM parking_session WHERE plate_no = $1 AND exit_time IS NULL`,
        [plate]
      );
      if (openCheck.rows.length > 0) {
        throw new HttpError(409, 'That vehicle is already in the lot.');
      }

      let floorId = null;
      if (floorArg && floorArg !== 'Any') {
        const floorRes = await client.query(
          `SELECT floor_id FROM floor WHERE code = $1 OR floor_name = $1 OR floor_name ILIKE $1 || '%' LIMIT 1`,
          [floorArg]
        );
        if (floorRes.rows.length === 0) {
          throw new HttpError(422, 'That value is not allowed.');
        }
        floorId = floorRes.rows[0].floor_id;
      }

      const slotRes = await client.query(
        floorId === null
          ? `SELECT slot_id, slot_code
             FROM slot
             WHERE status = 'FREE'
             ORDER BY (CASE WHEN kind = 'REGULAR' THEN 0 ELSE 1 END), floor_id, slot_no
             LIMIT 1
             FOR UPDATE SKIP LOCKED`
          : `SELECT slot_id, slot_code
             FROM slot
             WHERE status = 'FREE' AND floor_id = $1
             ORDER BY (CASE WHEN kind = 'REGULAR' THEN 0 ELSE 1 END), floor_id, slot_no
             LIMIT 1
             FOR UPDATE SKIP LOCKED`,
        floorId === null ? [] : [floorId]
      );

      if (slotRes.rows.length === 0) {
        throw new HttpError(409, 'No free slot on that floor. Try another floor.');
      }

      const slot = slotRes.rows[0];
      const sessionRes = await client.query(
        `INSERT INTO parking_session (plate_no, slot_id)
         VALUES ($1, $2)
         RETURNING session_id, entry_time`,
        [plate, slot.slot_id]
      );

      const tariffRes = await client.query(
        `SELECT first_hour AS first, extra_hour AS extra
         FROM tariff
         WHERE type_id = $1`,
        [vehicleTypeId]
      );

      await client.query('COMMIT');

      const session = sessionRes.rows[0];
      const tariff = tariffRes.rows[0];

      res.status(201).json({
        ticketNo: 'T-' + session.session_id,
        slot: slot.slot_code,
        plate,
        enteredAt: new Date(session.entry_time).toISOString(),
        tariff: {
          first: Number(tariff.first),
          extra: Number(tariff.extra)
        }
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  })
);

router.get(
  '/sessions/active',
  asyncHandler(async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT
         session_id AS id,
         plate_no AS plate,
         type_name AS type,
         slot_code AS slot,
         minutes_parked AS minutes
       FROM v_active_sessions
       ORDER BY minutes_parked DESC, session_id ASC`
    );
    res.json(rows);
  })
);

router.get(
  '/sessions/:id/bill',
  asyncHandler(async (req, res) => {
    const sessionId = Number(req.params.id);
    if (!Number.isInteger(sessionId) || sessionId <= 0) {
      throw new HttpError(404, 'That vehicle is not in the lot.');
    }

    const { rows } = await pool.query(
      `SELECT
         ps.plate_no AS plate,
         vt.type_name AS type,
         s.slot_code AS slot,
         GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (COALESCE(ps.exit_time, now()) - ps.entry_time)) / 60))::INT AS minutes,
         fn_hours_billed(ps.session_id) AS hours,
         CASE WHEN v.plan = 'MONTHLY' THEN 0 ELSE t.first_hour END AS first,
         (fn_hours_billed(ps.session_id) - 1)::INT AS "extraHours",
         CASE WHEN v.plan = 'MONTHLY' THEN 0 ELSE t.extra_hour END AS "extraEach",
         CASE
           WHEN v.plan = 'MONTHLY' THEN 0
           ELSE (fn_hours_billed(ps.session_id) - 1) * t.extra_hour
         END AS extra,
         calc_fee(ps.session_id) AS total
       FROM parking_session ps
       JOIN vehicle v       ON v.plate_no = ps.plate_no
       JOIN vehicle_type vt ON vt.type_id = v.type_id
       JOIN tariff t        ON t.type_id  = v.type_id
       JOIN slot s          ON s.slot_id  = ps.slot_id
       WHERE ps.session_id = $1 AND ps.exit_time IS NULL`,
      [sessionId]
    );

    if (rows.length === 0) {
      throw new HttpError(404, 'That vehicle is not in the lot.');
    }

    const row = rows[0];
    res.json({
      plate: row.plate,
      type: row.type,
      slot: row.slot,
      minutes: Number(row.minutes),
      hours: Number(row.hours),
      first: Number(row.first),
      extraHours: Number(row.extraHours),
      extraEach: Number(row.extraEach),
      extra: Number(row.extra),
      total: Number(row.total)
    });
  })
);

router.post(
  '/sessions/:id/exit',
  asyncHandler(async (req, res) => {
    const sessionId = Number(req.params.id);
    if (!Number.isInteger(sessionId) || sessionId <= 0) {
      throw new HttpError(404, 'That vehicle is not in the lot.');
    }

    const rawMethod = String((req.body && req.body.method) || 'UPI').trim().toUpperCase();

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const updSession = await client.query(
        `UPDATE parking_session
            SET exit_time = GREATEST(now(), entry_time + INTERVAL '1 millisecond')
          WHERE session_id = $1 AND exit_time IS NULL
          RETURNING session_id, plate_no, slot_id`,
        [sessionId]
      );

      if (updSession.rows.length === 0) {
        throw new HttpError(404, 'That vehicle is not in the lot.');
      }

      const closed = updSession.rows[0];
      const userId = req.user ? req.user.id : null;
      const txnRef =
        'SIM-' + Math.floor(100000 + Math.random() * 900000).toString();

      await client.query(
        `INSERT INTO payment_attempt (session_id, method, outcome, made_by)
         VALUES ($1, $2, 'SUCCESS', $3)`,
        [sessionId, rawMethod, userId]
      );

      const updPay = await client.query(
        `UPDATE payment
            SET status = 'PAID',
                method = $2,
                paid_at = now(),
                paid_by = $3,
                txn_ref = $4
          WHERE session_id = $1
          RETURNING amount, method, txn_ref`,
        [sessionId, rawMethod, userId, txnRef]
      );

      const slotRes = await client.query(
        `SELECT slot_code FROM slot WHERE slot_id = $1`,
        [closed.slot_id]
      );

      await client.query('COMMIT');

      res.json({
        amount: Number(updPay.rows[0].amount),
        method: updPay.rows[0].method,
        slot: slotRes.rows[0].slot_code,
        plate: closed.plate_no
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
