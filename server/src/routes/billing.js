const express = require('express');
const pool = require('../db');
const { asyncHandler } = require('../errors');

const router = express.Router();

router.get(
  '/tariff',
  asyncHandler(async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT
         vt.type_name AS type,
         t.first_hour AS first,
         t.extra_hour AS extra
       FROM tariff t
       JOIN vehicle_type vt ON vt.type_id = t.type_id
       ORDER BY vt.type_id`
    );

    res.json(
      rows.map((r) => ({
        type: r.type,
        first: Number(r.first),
        extra: Number(r.extra)
      }))
    );
  })
);

router.get(
  '/billing/summary',
  asyncHandler(async (_req, res) => {
    const [totalsRes, failedRes, daysRes, mixRes] = await Promise.all([
      pool.query(
        `SELECT
           COALESCE(SUM(amount) FILTER (
             WHERE status = 'PAID' AND COALESCE(paid_at, created_at)::DATE = CURRENT_DATE
           ), 0)::FLOAT AS "collectedToday",
           COUNT(*) FILTER (
             WHERE status = 'PAID' AND COALESCE(paid_at, created_at)::DATE = CURRENT_DATE
           )::INT AS "paymentsToday",
           COALESCE(SUM(amount) FILTER (WHERE status = 'PENDING'), 0)::FLOAT AS pending,
           COUNT(*) FILTER (WHERE status = 'PENDING')::INT AS "pendingCount"
         FROM payment`
      ),
      pool.query(
        `SELECT
           COALESCE(SUM(COALESCE(p.amount, calc_fee(pa.session_id))), 0)::FLOAT AS failed,
           COUNT(pa.attempt_id)::INT AS "failedCount"
         FROM payment_attempt pa
         LEFT JOIN payment p ON p.session_id = pa.session_id
         WHERE pa.outcome = 'FAILED'`
      ),
      pool.query(
        `SELECT
           TO_CHAR(gs.d, 'Dy') AS day,
           COALESCE(v.revenue, 0)::FLOAT AS amount
         FROM generate_series(
           CURRENT_DATE - INTERVAL '6 days',
           CURRENT_DATE,
           INTERVAL '1 day'
         ) AS gs(d)
         LEFT JOIN v_revenue_by_day v ON v.day = gs.d::DATE
         ORDER BY gs.d ASC`
      ),
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE method = 'UPI')::INT AS upi_count,
           COUNT(*) FILTER (WHERE method = 'CARD')::INT AS card_count,
           COUNT(*) FILTER (WHERE method = 'CASH')::INT AS cash_count,
           COUNT(*)::INT AS total_count
         FROM payment
         WHERE status = 'PAID'
           AND COALESCE(paid_at, created_at)::DATE = CURRENT_DATE`
      )
    ]);

    const t = totalsRes.rows[0];
    const f = failedRes.rows[0];
    const m = mixRes.rows[0];

    let upiPct = 0;
    let cardPct = 0;
    let cashPct = 0;
    if (m.total_count > 0) {
      upiPct = Math.round((m.upi_count / m.total_count) * 100);
      cardPct = Math.round((m.card_count / m.total_count) * 100);
      cashPct = Math.max(0, 100 - upiPct - cardPct);
    }

    res.json({
      collectedToday: Number(t.collectedToday),
      paymentsToday: t.paymentsToday,
      pending: Number(t.pending),
      pendingCount: t.pendingCount,
      failed: Number(f.failed),
      failedCount: f.failedCount,
      revenueByDay: daysRes.rows.map((r) => ({
        day: r.day,
        amount: Number(r.amount)
      })),
      methodMix: [
        { method: 'UPI', pct: upiPct },
        { method: 'Card', pct: cardPct },
        { method: 'Cash', pct: cashPct }
      ]
    });
  })
);

router.get(
  '/payments',
  asyncHandler(async (req, res) => {
    const rawStatus = String(req.query.status || 'All').trim();
    const dbStatus =
      rawStatus === 'All' || !rawStatus ? null : rawStatus.toUpperCase();

    const { rows } = await pool.query(
      `SELECT id, plate, method, amount, time, status, "paidBy"
       FROM (
         SELECT
           v.receipt AS id,
           v.plate_no AS plate,
           CASE
             WHEN v.status = 'PENDING' OR v.method IS NULL THEN 'Not chosen'
             WHEN v.method = 'UPI' THEN 'UPI'
             WHEN v.method = 'CARD' THEN 'Card'
             WHEN v.method = 'CASH' THEN 'Cash'
             ELSE v.method
           END AS method,
           v.amount,
           TO_CHAR(v.time, 'HH24:MI') AS time,
           CASE v.status
             WHEN 'PAID' THEN 'Paid'
             WHEN 'PENDING' THEN 'Pending'
           END AS status,
           CASE
             WHEN v.status = 'PENDING' THEN '—'
             WHEN v.paid_by_role = 'PARKER' THEN 'Parker'
             ELSE COALESCE(v.paid_by_name, 'Staff')
           END AS "paidBy",
           v.status AS raw_status,
           v.time AS sort_ts,
           v.payment_id AS sort_id
         FROM v_payment_list v
         WHERE v.status IN ('PAID', 'PENDING')

         UNION ALL

         SELECT
           CASE
             WHEN p.payment_id IS NOT NULL AND p.status = 'FAILED' THEN 'P-' || p.payment_id
             ELSE 'P-A' || pa.attempt_id
           END AS id,
           ps.plate_no AS plate,
           CASE pa.method
             WHEN 'UPI' THEN 'UPI'
             WHEN 'CARD' THEN 'Card'
             WHEN 'CASH' THEN 'Cash'
             ELSE pa.method
           END AS method,
           COALESCE(p.amount, calc_fee(pa.session_id)) AS amount,
           TO_CHAR(pa.created_at, 'HH24:MI') AS time,
           'Failed' AS status,
           CASE
             WHEN u.role = 'PARKER' THEN 'Parker'
             ELSE COALESCE(u.full_name, 'Parker')
           END AS "paidBy",
           'FAILED' AS raw_status,
           pa.created_at AS sort_ts,
           pa.attempt_id AS sort_id
         FROM payment_attempt pa
         JOIN parking_session ps ON ps.session_id = pa.session_id
         LEFT JOIN payment p     ON p.session_id = pa.session_id
         LEFT JOIN app_user u    ON u.user_id = pa.made_by
         WHERE pa.outcome = 'FAILED'
       ) combined
       WHERE ($1::TEXT IS NULL OR raw_status = $1)
       ORDER BY sort_ts DESC, sort_id DESC
       LIMIT 50`,
      [dbStatus]
    );

    res.json(
      rows.map((r) => ({
        id: r.id,
        plate: r.plate,
        method: r.method,
        amount: Number(r.amount),
        time: r.time,
        status: r.status,
        paidBy: r.paidBy
      }))
    );
  })
);

module.exports = router;
