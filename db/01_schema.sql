-- 01_schema.sql: Core schema, constraints, and indexes for ParkSmart

DROP VIEW IF EXISTS v_my_sessions CASCADE;
DROP VIEW IF EXISTS v_revenue_by_day CASCADE;
DROP VIEW IF EXISTS v_payment_list CASCADE;
DROP VIEW IF EXISTS v_vehicle_list CASCADE;
DROP VIEW IF EXISTS v_slot_detail CASCADE;
DROP VIEW IF EXISTS v_active_sessions CASCADE;
DROP VIEW IF EXISTS v_floor_occupancy CASCADE;

DROP TABLE IF EXISTS payment_attempt CASCADE;
DROP TABLE IF EXISTS app_user CASCADE;
DROP TABLE IF EXISTS reservation CASCADE;
DROP TABLE IF EXISTS payment CASCADE;
DROP TABLE IF EXISTS parking_session CASCADE;
DROP TABLE IF EXISTS slot CASCADE;
DROP TABLE IF EXISTS floor CASCADE;
DROP TABLE IF EXISTS vehicle CASCADE;
DROP TABLE IF EXISTS tariff CASCADE;
DROP TABLE IF EXISTS vehicle_type CASCADE;
DROP TABLE IF EXISTS owner CASCADE;

CREATE TABLE owner (
  owner_id    SERIAL PRIMARY KEY,
  full_name   VARCHAR(80)  NOT NULL,
  phone       VARCHAR(15)  NOT NULL UNIQUE,
  email       VARCHAR(100)
);

CREATE TABLE vehicle_type (
  type_id     SERIAL PRIMARY KEY,
  type_name   VARCHAR(20)  NOT NULL UNIQUE          -- Bike, Car, SUV
);

CREATE TABLE tariff (
  type_id     INT PRIMARY KEY REFERENCES vehicle_type(type_id),
  first_hour  NUMERIC(6,2) NOT NULL CHECK (first_hour  >= 0),
  extra_hour  NUMERIC(6,2) NOT NULL CHECK (extra_hour >= 0)
);

CREATE TABLE vehicle (
  plate_no      VARCHAR(15)  PRIMARY KEY,           -- stored upper-case, single spaces
  type_id       INT NOT NULL REFERENCES vehicle_type(type_id),
  owner_id      INT NOT NULL REFERENCES owner(owner_id),
  plan          VARCHAR(15)  NOT NULL DEFAULT 'PAY_PER_HOUR'
                CHECK (plan IN ('MONTHLY','PAY_PER_HOUR','VISITOR')),
  registered_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE floor (
  floor_id    SERIAL PRIMARY KEY,
  floor_name  VARCHAR(20)  NOT NULL UNIQUE,         -- 'Ground floor','Level 1','Level 2'
  code        VARCHAR(3)   NOT NULL UNIQUE          -- 'G','L1','L2'
);

CREATE TABLE slot (
  slot_id     SERIAL PRIMARY KEY,
  floor_id    INT NOT NULL REFERENCES floor(floor_id),
  slot_code   VARCHAR(8)   NOT NULL UNIQUE,         -- 'G-07', 'L1-14'
  slot_no     INT NOT NULL,
  kind        VARCHAR(10)  NOT NULL DEFAULT 'REGULAR'
              CHECK (kind IN ('REGULAR','EV','ACCESSIBLE')),
  status      VARCHAR(12)  NOT NULL DEFAULT 'FREE'
              CHECK (status IN ('FREE','OCCUPIED','RESERVED','MAINTENANCE')),
  UNIQUE (floor_id, slot_no)
);

CREATE TABLE parking_session (
  session_id  SERIAL PRIMARY KEY,
  plate_no    VARCHAR(15)  NOT NULL REFERENCES vehicle(plate_no),
  slot_id     INT NOT NULL REFERENCES slot(slot_id),
  entry_time  TIMESTAMP NOT NULL DEFAULT now(),
  exit_time   TIMESTAMP,
  CHECK (exit_time IS NULL OR exit_time > entry_time)
);

CREATE TABLE payment (
  payment_id  SERIAL PRIMARY KEY,
  session_id  INT NOT NULL UNIQUE REFERENCES parking_session(session_id),
  amount      NUMERIC(8,2) NOT NULL CHECK (amount >= 0),
  method      VARCHAR(10)  CHECK (method IN ('UPI','CARD','CASH')),
  status      VARCHAR(10)  NOT NULL DEFAULT 'PENDING'
              CHECK (status IN ('PENDING','PAID','FAILED')),
  created_at  TIMESTAMP NOT NULL DEFAULT now(),
  paid_at     TIMESTAMP
);

CREATE TABLE reservation (
  reservation_id SERIAL PRIMARY KEY,
  plate_no       VARCHAR(15) NOT NULL REFERENCES vehicle(plate_no),
  slot_id        INT NOT NULL REFERENCES slot(slot_id),
  created_at     TIMESTAMP NOT NULL DEFAULT now(),
  expires_at     TIMESTAMP NOT NULL,
  CHECK (expires_at > created_at)
);

-- one parked vehicle per slot, one parking place per vehicle
CREATE UNIQUE INDEX uq_open_session_per_slot  ON parking_session (slot_id) WHERE exit_time IS NULL;
CREATE UNIQUE INDEX uq_open_session_per_plate ON parking_session (plate_no) WHERE exit_time IS NULL;

-- lookups the app does constantly
CREATE INDEX idx_slot_floor_status  ON slot (floor_id, status);
CREATE INDEX idx_session_plate_time ON parking_session (plate_no, entry_time DESC);
CREATE INDEX idx_payment_status     ON payment (status, created_at DESC);
