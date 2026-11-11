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
    const [totalsRes, daysRes, mixRes] = await Promise.all([
      pool.query(
        `SELECT
           COALESCE(SUM(amount) FILTER (
             WHERE status = 'PAID' AND COALESCE(paid_at, created_at)::DATE = CURRENT_DATE
           ), 0)::FLOAT AS "collectedToday",
           COUNT(*) FILTER (
             WHERE status = 'PAID' AND COALESCE(paid_at, created_at)::DATE = CURRENT_DATE
           )::INT AS "paymentsToday",
           COALESCE(SUM(amount) FILTER (WHERE status = 'PENDING'), 0)::FLOAT AS pending,
           COUNT(*) FILTER (WHERE status = 'PENDING')::INT AS "pendingCount",
           COALESCE(SUM(amount) FILTER (WHERE status = 'FAILED'), 0)::FLOAT AS failed,
           COUNT(*) FILTER (WHERE status = 'FAILED')::INT AS "failedCount"
         FROM payment`
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
      failed: Number(t.failed),
      failedCount: t.failedCount,
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
      `SELECT
         receipt AS id,
         plate_no AS plate,
         CASE
           WHEN status = 'PENDING' OR method IS NULL THEN 'Not chosen'
           WHEN method = 'UPI' THEN 'UPI'
           WHEN method = 'CARD' THEN 'Card'
           WHEN method = 'CASH' THEN 'Cash'
           ELSE method
         END AS method,
         amount,
         TO_CHAR(time, 'HH24:MI') AS time,
         CASE status
           WHEN 'PAID' THEN 'Paid'
           WHEN 'PENDING' THEN 'Pending'
           WHEN 'FAILED' THEN 'Failed'
           ELSE status
         END AS status
       FROM v_payment_list
       WHERE ($1::TEXT IS NULL OR status = $1)
       ORDER BY time DESC, payment_id DESC
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
        status: r.status
      }))
    );
  })
);

module.exports = router;
