-- 07_auth.sql: User accounts, roles, payment attempts, payment extensions, and parker view

DROP VIEW IF EXISTS v_my_sessions CASCADE;
DROP TABLE IF EXISTS payment_attempt CASCADE;
DROP TABLE IF EXISTS app_user CASCADE;

CREATE TABLE app_user (
  user_id       SERIAL PRIMARY KEY,
  email         VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(100) NOT NULL,
  full_name     VARCHAR(80)  NOT NULL,
  role          VARCHAR(10)  NOT NULL CHECK (role IN ('ADMIN','STAFF','PARKER')),
  owner_id      INT UNIQUE REFERENCES owner(owner_id),   -- set for PARKER only
  active        BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMP    NOT NULL DEFAULT now(),
  CHECK ((role = 'PARKER') = (owner_id IS NOT NULL))
);

CREATE TABLE payment_attempt (
  attempt_id SERIAL PRIMARY KEY,
  session_id INT         NOT NULL REFERENCES parking_session(session_id),
  method     VARCHAR(10) NOT NULL CHECK (method IN ('UPI','CARD','CASH')),
  outcome    VARCHAR(10) NOT NULL CHECK (outcome IN ('SUCCESS','FAILED')),
  made_by    INT REFERENCES app_user(user_id),
  created_at TIMESTAMP   NOT NULL DEFAULT now()
);

ALTER TABLE payment
  ADD COLUMN IF NOT EXISTS txn_ref VARCHAR(20) UNIQUE,
  ADD COLUMN IF NOT EXISTS paid_by INT;

ALTER TABLE payment
  DROP CONSTRAINT IF EXISTS payment_paid_by_fkey;

ALTER TABLE payment
  ADD CONSTRAINT payment_paid_by_fkey
  FOREIGN KEY (paid_by) REFERENCES app_user(user_id);

CREATE INDEX IF NOT EXISTS idx_payment_attempt_session
  ON payment_attempt (session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_attempt_outcome
  ON payment_attempt (outcome, created_at DESC);

CREATE OR REPLACE VIEW v_my_sessions AS
SELECT
  ps.session_id,
  v.owner_id,
  ps.plate_no,
  vt.type_name,
  s.slot_code,
  f.floor_name,
  ps.entry_time,
  ps.exit_time,
  GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (COALESCE(ps.exit_time, now()) - ps.entry_time)) / 60))::INT AS minutes_parked,
  COALESCE(p.amount, calc_fee(ps.session_id)) AS fee,
  COALESCE(p.status, CASE WHEN ps.exit_time IS NULL THEN 'ACTIVE' ELSE 'PENDING' END) AS payment_status
FROM parking_session ps
JOIN vehicle v       ON v.plate_no = ps.plate_no
JOIN vehicle_type vt ON vt.type_id = v.type_id
JOIN slot s          ON s.slot_id  = ps.slot_id
JOIN floor f         ON f.floor_id = s.floor_id
LEFT JOIN payment p  ON p.session_id = ps.session_id;

CREATE OR REPLACE VIEW v_payment_list AS
SELECT
  p.payment_id,
  'P-' || p.payment_id AS receipt,
  ps.plate_no,
  p.method,
  p.amount,
  p.status,
  COALESCE(p.paid_at, p.created_at) AS time,
  p.txn_ref,
  p.paid_by,
  u.full_name AS paid_by_name,
  u.role AS paid_by_role
FROM payment p
JOIN parking_session ps ON ps.session_id = p.session_id
LEFT JOIN app_user u    ON u.user_id = p.paid_by;
