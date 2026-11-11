-- 04_views.sql: Views for dashboard, floor occupancy, slot details, vehicles, and billing

CREATE OR REPLACE VIEW v_floor_occupancy AS
SELECT
  f.floor_id,
  f.floor_name,
  f.code,
  COUNT(s.slot_id)::INT AS total_slots,
  COUNT(s.slot_id) FILTER (WHERE s.status = 'OCCUPIED')::INT AS occupied,
  COUNT(s.slot_id) FILTER (WHERE s.status = 'RESERVED')::INT AS reserved,
  COUNT(s.slot_id) FILTER (WHERE s.status = 'FREE')::INT AS free_slots,
  COALESCE(
    ROUND(
      COUNT(s.slot_id) FILTER (WHERE s.status = 'OCCUPIED') * 100.0 / NULLIF(COUNT(s.slot_id), 0)
    )::INT,
    0
  ) AS occupancy_pct
FROM floor f
LEFT JOIN slot s ON s.floor_id = f.floor_id
GROUP BY f.floor_id, f.floor_name, f.code
ORDER BY f.floor_id;

CREATE OR REPLACE VIEW v_active_sessions AS
SELECT
  ps.session_id,
  ps.plate_no,
  vt.type_name,
  o.full_name AS owner_name,
  f.floor_name,
  s.slot_code,
  ps.entry_time,
  GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now() - ps.entry_time)) / 60))::INT AS minutes_parked,
  calc_fee(ps.session_id) AS fee_so_far
FROM parking_session ps
JOIN vehicle v       ON v.plate_no = ps.plate_no
JOIN vehicle_type vt ON vt.type_id = v.type_id
JOIN owner o         ON o.owner_id = v.owner_id
JOIN slot s          ON s.slot_id  = ps.slot_id
JOIN floor f         ON f.floor_id = s.floor_id
WHERE ps.exit_time IS NULL;

CREATE OR REPLACE VIEW v_slot_detail AS
SELECT
  s.slot_id,
  s.floor_id,
  s.slot_code,
  s.slot_no,
  s.kind,
  s.status,
  f.floor_name,
  ps.plate_no AS plate,
  ps.entry_time,
  CASE
    WHEN ps.session_id IS NOT NULL
    THEN GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now() - ps.entry_time)) / 60))::INT
    ELSE NULL
  END AS minutes,
  CASE
    WHEN ps.session_id IS NOT NULL
    THEN calc_fee(ps.session_id)
    ELSE NULL
  END AS fee_so_far,
  r.plate_no AS reserved_plate,
  r.expires_at
FROM slot s
JOIN floor f ON f.floor_id = s.floor_id
LEFT JOIN parking_session ps
  ON ps.slot_id = s.slot_id AND ps.exit_time IS NULL
LEFT JOIN LATERAL (
  SELECT rv.plate_no, rv.expires_at
  FROM reservation rv
  WHERE rv.slot_id = s.slot_id
  ORDER BY rv.created_at DESC
  LIMIT 1
) r ON s.status = 'RESERVED';

CREATE OR REPLACE VIEW v_vehicle_list AS
SELECT
  v.plate_no,
  vt.type_name,
  o.full_name AS owner_name,
  v.plan,
  COUNT(ps.session_id)::INT AS visits,
  GREATEST(MAX(ps.entry_time), MAX(rv.created_at)) AS last_seen
FROM vehicle v
JOIN vehicle_type vt ON vt.type_id = v.type_id
JOIN owner o         ON o.owner_id = v.owner_id
LEFT JOIN parking_session ps ON ps.plate_no = v.plate_no
LEFT JOIN reservation rv     ON rv.plate_no = v.plate_no
GROUP BY v.plate_no, vt.type_name, o.full_name, v.plan, v.registered_at;

CREATE OR REPLACE VIEW v_payment_list AS
SELECT
  p.payment_id,
  'P-' || p.payment_id AS receipt,
  ps.plate_no,
  p.method,
  p.amount,
  p.status,
  COALESCE(p.paid_at, p.created_at) AS time
FROM payment p
JOIN parking_session ps ON ps.session_id = p.session_id;

CREATE OR REPLACE VIEW v_revenue_by_day AS
SELECT
  COALESCE(p.paid_at, p.created_at)::DATE AS day,
  COUNT(*)::INT AS payments,
  COALESCE(SUM(p.amount), 0)::NUMERIC(10,2) AS revenue
FROM payment p
WHERE p.status = 'PAID'
GROUP BY COALESCE(p.paid_at, p.created_at)::DATE
ORDER BY day DESC;
