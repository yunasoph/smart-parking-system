const express = require('express');
const pool = require('../db');
const { asyncHandler } = require('../errors');

const router = express.Router();

router.get(
  '/dashboard',
  asyncHandler(async (_req, res) => {
    const [floorsRes, statsRes, hoursRes, activityRes, alertsRes] = await Promise.all([
      pool.query(
        `SELECT floor_name AS name,
                total_slots AS total,
                occupied,
                reserved
         FROM v_floor_occupancy
         ORDER BY floor_id`
      ),
      pool.query(
        `SELECT
           COALESCE(
             (SELECT revenue FROM v_revenue_by_day WHERE day = CURRENT_DATE),
             0
           )::FLOAT AS "revenueToday",
           (SELECT COUNT(*)::INT
              FROM parking_session
             WHERE exit_time::DATE = CURRENT_DATE) AS "completedToday",
           COALESCE(
             (SELECT ROUND(AVG(EXTRACT(EPOCH FROM (exit_time - entry_time)) / 60))::INT
                FROM parking_session
               WHERE exit_time::DATE = CURRENT_DATE),
             0
           ) AS "avgStayMinutes"`
      ),
      pool.query(
        `SELECT gs.hr AS hour,
                COUNT(ps.session_id)::INT AS count
         FROM generate_series(6, 20) AS gs(hr)
         LEFT JOIN parking_session ps
           ON ps.entry_time::DATE = CURRENT_DATE
          AND EXTRACT(HOUR FROM ps.entry_time)::INT = gs.hr
         GROUP BY gs.hr
         ORDER BY gs.hr`
      ),
      pool.query(
        `SELECT plate, slot, event, time, status, tone
         FROM (
           SELECT
             ps.plate_no AS plate,
             s.slot_code AS slot,
             'Entry' AS event,
             TO_CHAR(ps.entry_time, 'HH24:MI') AS time,
             'In lot' AS status,
             'teal' AS tone,
             ps.entry_time AS sort_ts
           FROM parking_session ps
           JOIN slot s ON s.slot_id = ps.slot_id
           WHERE ps.exit_time IS NULL

           UNION ALL

           SELECT
             ps.plate_no AS plate,
             s.slot_code AS slot,
             'Exit' AS event,
             TO_CHAR(ps.exit_time, 'HH24:MI') AS time,
             CASE
               WHEN p.status = 'PAID' THEN 'Paid ₹' || TRIM(TO_CHAR(p.amount, 'FM999999990'))
               ELSE 'Unpaid'
             END AS status,
             CASE
               WHEN p.status = 'PAID' THEN 'navy'
               ELSE 'amber'
             END AS tone,
             ps.exit_time AS sort_ts
           FROM parking_session ps
           JOIN slot s ON s.slot_id = ps.slot_id
           LEFT JOIN payment p ON p.session_id = ps.session_id
           WHERE ps.exit_time IS NOT NULL

           UNION ALL

           SELECT
             r.plate_no AS plate,
             s.slot_code AS slot,
             'Reserved' AS event,
             TO_CHAR(r.created_at, 'HH24:MI') AS time,
             'Waiting' AS status,
             'amber' AS tone,
             r.created_at AS sort_ts
           FROM reservation r
           JOIN slot s ON s.slot_id = r.slot_id
         ) ev
         ORDER BY sort_ts DESC
         LIMIT 5`
      ),
      pool.query(
        `SELECT
           (SELECT COUNT(*)::INT
              FROM parking_session
             WHERE exit_time IS NULL
               AND entry_time < now() - INTERVAL '12 hours') AS overstay,
           (SELECT COUNT(*)::INT
              FROM reservation
             WHERE created_at < now() - INTERVAL '30 minutes') AS unclaimed,
           (SELECT COUNT(*)::INT
              FROM payment
             WHERE status = 'PENDING'
               AND created_at < now() - INTERVAL '1 hour') AS unpaid`
      )
    ]);

    const stats = statsRes.rows[0];
    const alertCounts = alertsRes.rows[0];

    res.json({
      floors: floorsRes.rows,
      revenueToday: Number(stats.revenueToday),
      completedToday: stats.completedToday,
      avgStayMinutes: stats.avgStayMinutes,
      entriesByHour: hoursRes.rows,
      activity: activityRes.rows,
      alerts: [
        { kind: 'overstay', count: alertCounts.overstay },
        { kind: 'unclaimed', count: alertCounts.unclaimed },
        { kind: 'unpaid', count: alertCounts.unpaid }
      ]
    });
  })
);

module.exports = router;
