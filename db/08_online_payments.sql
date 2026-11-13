-- 08_online_payments.sql: Permanent ledger for money paid online before parking
-- (advance bookings and monthly passes). Reservations are deleted once claimed,
-- cancelled or expired, so the payment itself is kept here.

DROP TABLE IF EXISTS online_payment CASCADE;

CREATE TABLE online_payment (
  online_payment_id SERIAL PRIMARY KEY,
  kind        VARCHAR(10)  NOT NULL CHECK (kind IN ('BOOKING','PASS')),
  plate_no    VARCHAR(15)  NOT NULL REFERENCES vehicle(plate_no) ON DELETE CASCADE,
  slot_id     INT          REFERENCES slot(slot_id),          -- BOOKING only
  amount      NUMERIC(8,2) NOT NULL CHECK (amount >= 0),
  method      VARCHAR(10)  NOT NULL CHECK (method IN ('UPI','CARD')),
  -- BOOKING: PAID (bay held) -> USED (credited at entry) | REFUNDED (cancelled) | EXPIRED (no-show)
  -- PASS:    PAID
  status      VARCHAR(10)  NOT NULL DEFAULT 'PAID'
              CHECK (status IN ('PAID','USED','REFUNDED','EXPIRED')),
  txn_ref     VARCHAR(20)  NOT NULL UNIQUE,
  paid_by     INT          REFERENCES app_user(user_id) ON DELETE SET NULL,
  valid_until TIMESTAMP,                                     -- PASS only
  created_at  TIMESTAMP    NOT NULL DEFAULT now(),
  CHECK ((kind = 'BOOKING') = (slot_id IS NOT NULL)),
  CHECK ((kind = 'PASS') = (valid_until IS NOT NULL)),
  CHECK (kind = 'BOOKING' OR status = 'PAID')
);

CREATE INDEX idx_online_payment_plate ON online_payment (plate_no, created_at DESC);
CREATE INDEX idx_online_payment_day   ON online_payment (created_at DESC);
