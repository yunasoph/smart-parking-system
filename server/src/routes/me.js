const express = require('express');
const pool = require('../db');
const { HttpError, asyncHandler } = require('../errors');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use('/me', requireAuth, requireRole('PARKER'));

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
         COUNT(ps.session_id)::INT AS visits,
         BOOL_OR(ps.session_id IS NOT NULL AND ps.exit_time IS NULL) AS "inLot",
         MAX(s.slot_code) FILTER (WHERE ps.session_id IS NOT NULL AND ps.exit_time IS NULL) AS slot
       FROM vehicle v
       JOIN vehicle_type vt ON vt.type_id = v.type_id
       LEFT JOIN parking_session ps ON ps.plate_no = v.plate_no
       LEFT JOIN slot s ON s.slot_id = ps.slot_id
       WHERE v.owner_id = $1
       GROUP BY v.plate_no, vt.type_name, v.plan, v.registered_at
       ORDER BY v.registered_at DESC`,
      [req.user.ownerId]
    );
    res.json(rows);
  })
);

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
