-- 05_seed.sql: Idempotent seed data for ParkSmart

TRUNCATE TABLE
  reservation,
  payment,
  parking_session,
  slot,
  floor,
  vehicle,
  tariff,
  vehicle_type,
  owner
RESTART IDENTITY CASCADE;

-- 1. Vehicle types and tariffs
INSERT INTO vehicle_type (type_name) VALUES
  ('Bike'),
  ('Car'),
  ('SUV');

INSERT INTO tariff (type_id, first_hour, extra_hour)
SELECT type_id,
       CASE type_name WHEN 'Bike' THEN 15 WHEN 'Car' THEN 40 WHEN 'SUV' THEN 60 END,
       CASE type_name WHEN 'Bike' THEN 10 WHEN 'Car' THEN 30 WHEN 'SUV' THEN 45 END
FROM vehicle_type;

-- 2. Floors and 200 slots (Ground: 60, Level 1: 70, Level 2: 70)
INSERT INTO floor (floor_name, code) VALUES
  ('Ground floor', 'G'),
  ('Level 1',      'L1'),
  ('Level 2',      'L2');

INSERT INTO slot (floor_id, slot_code, slot_no, kind)
SELECT
  f.floor_id,
  f.code || '-' || LPAD(gs.n::TEXT, 2, '0'),
  gs.n,
  CASE
    WHEN gs.n % 9 = 0  THEN 'EV'
    WHEN gs.n % 13 = 0 THEN 'ACCESSIBLE'
    ELSE 'REGULAR'
  END
FROM floor f
CROSS JOIN LATERAL generate_series(
  1,
  CASE f.code WHEN 'G' THEN 60 WHEN 'L1' THEN 70 WHEN 'L2' THEN 70 END
) AS gs(n)
ORDER BY f.floor_id, gs.n;

-- 3. Owners for the 12 core vehicles + Visitor placeholder + generated owners
INSERT INTO owner (full_name, phone, email) VALUES
  ('Aarav Mehta',    '9810000001', 'aarav.mehta@example.com'),
  ('Isha Kapoor',    '9810000002', 'isha.kapoor@example.com'),
  ('Rohan Bhatia',   '9810000003', 'rohan.bhatia@example.com'),
  ('Meera Joshi',    '9810000004', 'meera.joshi@example.com'),
  ('Kabir Malhotra', '9810000005', 'kabir.malhotra@example.com'),
  ('Simran Gill',    '9810000006', 'simran.gill@example.com'),
  ('Dev Arora',      '9810000007', 'dev.arora@example.com'),
  ('Nisha Rao',      '9810000008', 'nisha.rao@example.com'),
  ('Vihaan Sethi',   '9810000009', 'vihaan.sethi@example.com'),
  ('Anaya Verma',    '9810000010', 'anaya.verma@example.com'),
  ('Reyansh Khanna', '9810000011', 'reyansh.khanna@example.com'),
  ('Tara Chopra',    '9810000012', 'tara.chopra@example.com'),
  ('Visitor',        '9999999999', NULL);

-- 4. The 12 vehicles from prototypes/vehicles.html
INSERT INTO vehicle (plate_no, type_id, owner_id, plan, registered_at) VALUES
  ('HR 06 AK 4821', (SELECT type_id FROM vehicle_type WHERE type_name = 'Car'),  1,  'MONTHLY',      now() - INTERVAL '60 days'),
  ('HR 06 CD 3380', (SELECT type_id FROM vehicle_type WHERE type_name = 'Car'),  2,  'PAY_PER_HOUR', now() - INTERVAL '45 days'),
  ('DL 8C AF 1099', (SELECT type_id FROM vehicle_type WHERE type_name = 'SUV'),  3,  'PAY_PER_HOUR', now() - INTERVAL '30 days'),
  ('UP 14 BT 2204', (SELECT type_id FROM vehicle_type WHERE type_name = 'Bike'), 4,  'MONTHLY',      now() - INTERVAL '60 days'),
  ('HR 06 MN 7788', (SELECT type_id FROM vehicle_type WHERE type_name = 'Car'),  5,  'PAY_PER_HOUR', now() - INTERVAL '40 days'),
  ('PB 65 K 7312',  (SELECT type_id FROM vehicle_type WHERE type_name = 'Car'),  6,  'VISITOR',      now() - INTERVAL '10 days'),
  ('HR 99 R 0456',  (SELECT type_id FROM vehicle_type WHERE type_name = 'Bike'), 7,  'MONTHLY',      now() - INTERVAL '50 days'),
  ('HR 26 DK 9017', (SELECT type_id FROM vehicle_type WHERE type_name = 'SUV'),  8,  'MONTHLY',      now() - INTERVAL '55 days'),
  ('HR 06 PQ 1163', (SELECT type_id FROM vehicle_type WHERE type_name = 'Car'),  9,  'VISITOR',      now() - INTERVAL '5 days'),
  ('DL 3C BV 5520', (SELECT type_id FROM vehicle_type WHERE type_name = 'Car'),  10, 'PAY_PER_HOUR', now() - INTERVAL '25 days'),
  ('UP 16 AX 3345', (SELECT type_id FROM vehicle_type WHERE type_name = 'Bike'), 11, 'VISITOR',      now() - INTERVAL '15 days'),
  ('HR 06 TT 8802', (SELECT type_id FROM vehicle_type WHERE type_name = 'SUV'),  12, 'MONTHLY',      now() - INTERVAL '58 days');

-- Extra named vehicles for billing/activity continuity
INSERT INTO vehicle (plate_no, type_id, owner_id, plan, registered_at) VALUES
  ('HR 06 BQ 2210', (SELECT type_id FROM vehicle_type WHERE type_name = 'Car'),  13, 'PAY_PER_HOUR', now() - INTERVAL '20 days'),
  ('DL 3C KT 4410', (SELECT type_id FROM vehicle_type WHERE type_name = 'SUV'),  13, 'PAY_PER_HOUR', now() - INTERVAL '20 days'),
  ('HR 26 MN 6612', (SELECT type_id FROM vehicle_type WHERE type_name = 'Car'),  13, 'PAY_PER_HOUR', now() - INTERVAL '20 days'),
  ('HR 06 JK 8801', (SELECT type_id FROM vehicle_type WHERE type_name = 'Car'),  13, 'PAY_PER_HOUR', now() - INTERVAL '20 days'),
  ('HR 06 GH 5531', (SELECT type_id FROM vehicle_type WHERE type_name = 'Car'),  13, 'PAY_PER_HOUR', now() - INTERVAL '20 days'),
  ('PB 10 AB 1177', (SELECT type_id FROM vehicle_type WHERE type_name = 'SUV'),  13, 'PAY_PER_HOUR', now() - INTERVAL '20 days');

-- Generate extra vehicles with generate_series for open and historical sessions (HR 06 XX 1001 .. HR 06 XX 1160)
INSERT INTO owner (full_name, phone)
SELECT
  'Driver ' || gs.i,
  '98200' || LPAD(gs.i::TEXT, 5, '0')
FROM generate_series(1, 160) AS gs(i);

INSERT INTO vehicle (plate_no, type_id, owner_id, plan, registered_at)
SELECT
  'HR 06 XX ' || (1000 + gs.i)::TEXT,
  ((gs.i - 1) % 3) + 1,
  13 + gs.i,
  CASE
    WHEN gs.i % 7 = 0 THEN 'VISITOR'
    ELSE 'PAY_PER_HOUR'
  END,
  now() - INTERVAL '35 days'
FROM generate_series(1, 160) AS gs(i);

-- 5. Historical completed sessions over the last 30 days (including today)
-- Created via normal INSERT then UPDATE exit_time so triggers run and set slot status + create payments.
DO $$
DECLARE
  v_day        INT;
  v_idx        INT;
  v_sessions   INT;
  v_plate      VARCHAR(15);
  v_slot_id    INT;
  v_entry      TIMESTAMP;
  v_exit       TIMESTAMP;
  v_session_id INT;
  v_method     VARCHAR(10);
BEGIN
  FOR v_day IN REVERSE 29..1 LOOP
    v_sessions := 14 + (v_day % 7) * 2;
    FOR v_idx IN 1..v_sessions LOOP
      v_plate := 'HR 06 XX ' || (1000 + ((v_day * 7 + v_idx) % 150) + 1)::TEXT;
      v_slot_id := ((v_day * 11 + v_idx) % 200) + 1;
      v_entry := date_trunc('day', now() - (v_day || ' days')::INTERVAL)
                 + ((6 + (v_idx % 12)) || ' hours')::INTERVAL
                 + ((v_idx * 3 % 50) || ' minutes')::INTERVAL;
      v_exit  := v_entry + ((65 + (v_idx % 4) * 60) || ' minutes')::INTERVAL;

      INSERT INTO parking_session (plate_no, slot_id, entry_time)
      VALUES (v_plate, v_slot_id, v_entry)
      RETURNING session_id INTO v_session_id;

      UPDATE parking_session
         SET exit_time = v_exit
       WHERE session_id = v_session_id;

      v_method := CASE
        WHEN (v_idx % 20) < 12 THEN 'UPI'
        WHEN (v_idx % 20) < 17 THEN 'CARD'
        ELSE 'CASH'
      END;

      UPDATE payment
         SET status  = 'PAID',
             method  = v_method,
             paid_at = v_exit
       WHERE session_id = v_session_id;
    END LOOP;
  END LOOP;
END;
$$;

-- Historical visits for the 12 main vehicles so their visit counts and last_seen match prototypes
DO $$
DECLARE
  r RECORD;
  i INT;
  v_entry TIMESTAMP;
  v_exit  TIMESTAMP;
  v_sid   INT;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('HR 06 AK 4821', 40, 1),
      ('HR 06 CD 3380', 16, 2),
      ('DL 8C AF 1099', 8,  3),
      ('UP 14 BT 2204', 51, 4),
      ('HR 06 MN 7788', 22, 5),
      ('PB 65 K 7312',  2,  6),
      ('HR 99 R 0456',  37, 7),
      ('HR 26 DK 9017', 44, 8),
      ('HR 06 PQ 1163', 1,  9),
      ('DL 3C BV 5520', 6,  10),
      ('UP 16 AX 3345', 3,  11),
      ('HR 06 TT 8802', 47, 12)
    ) AS t(plate, past_visits, slot_num)
  LOOP
    FOR i IN 1..r.past_visits LOOP
      IF i = r.past_visits AND r.plate = 'HR 26 DK 9017' THEN
        v_entry := date_trunc('day', now() - INTERVAL '1 day') + INTERVAL '18 hours 20 minutes';
      ELSIF i = r.past_visits AND r.plate = 'HR 06 PQ 1163' THEN
        v_entry := date_trunc('day', now() - INTERVAL '1 day') + INTERVAL '15 hours 05 minutes';
      ELSIF i = r.past_visits AND r.plate = 'DL 3C BV 5520' THEN
        v_entry := date_trunc('day', now() - INTERVAL '1 day') + INTERVAL '11 hours 42 minutes';
      ELSIF i = r.past_visits AND r.plate = 'UP 16 AX 3345' THEN
        v_entry := date_trunc('day', now() - INTERVAL '2 days') + INTERVAL '13 hours 10 minutes';
      ELSIF i = r.past_visits AND r.plate = 'HR 06 TT 8802' THEN
        v_entry := date_trunc('day', now() - INTERVAL '2 days') + INTERVAL '09 hours 55 minutes';
      ELSE
        v_entry := now() - ((30 + i) || ' days')::INTERVAL + INTERVAL '9 hours';
      END IF;
      v_exit := v_entry + INTERVAL '90 minutes';

      INSERT INTO parking_session (plate_no, slot_id, entry_time)
      VALUES (r.plate, r.slot_num, v_entry)
      RETURNING session_id INTO v_sid;

      UPDATE parking_session
         SET exit_time = v_exit
       WHERE session_id = v_sid;

      UPDATE payment
         SET status  = 'PAID',
             method  = 'UPI',
             paid_at = v_exit
       WHERE session_id = v_sid;
    END LOOP;
  END LOOP;
END;
$$;

-- 6. Today's completed sessions + 2 PENDING payments (> 1h old) + 1 FAILED payment + recent PAID payments
DO $$
DECLARE
  v_idx      INT;
  v_plate    VARCHAR(15);
  v_slot_id  INT;
  v_entry    TIMESTAMP;
  v_exit     TIMESTAMP;
  v_sid      INT;
  v_method   VARCHAR(10);
BEGIN
  -- 32 completed sessions earlier today
  FOR v_idx IN 1..32 LOOP
    v_plate   := 'HR 06 XX ' || (1000 + v_idx)::TEXT;
    v_slot_id := v_idx;
    v_entry   := now() - INTERVAL '8 hours' + (v_idx * 4 || ' minutes')::INTERVAL;
    v_exit    := v_entry + INTERVAL '135 minutes';

    INSERT INTO parking_session (plate_no, slot_id, entry_time)
    VALUES (v_plate, v_slot_id, v_entry)
    RETURNING session_id INTO v_sid;

    UPDATE parking_session SET exit_time = v_exit WHERE session_id = v_sid;

    v_method := CASE
      WHEN v_idx <= 19 THEN 'UPI'
      WHEN v_idx <= 27 THEN 'CARD'
      ELSE 'CASH'
    END;

    UPDATE payment
       SET status  = 'PAID',
           method  = v_method,
           paid_at = v_exit
     WHERE session_id = v_sid;
  END LOOP;

  -- Pending payment #1 (closed > 2 hours ago, unpaid)
  INSERT INTO parking_session (plate_no, slot_id, entry_time)
  VALUES ('PB 10 AB 1177', (SELECT slot_id FROM slot WHERE slot_code = 'G-58'), now() - INTERVAL '4 hours')
  RETURNING session_id INTO v_sid;
  UPDATE parking_session SET exit_time = now() - INTERVAL '3 hours 10 minutes' WHERE session_id = v_sid;

  -- Pending payment #2 (closed > 2 hours ago, unpaid)
  INSERT INTO parking_session (plate_no, slot_id, entry_time)
  VALUES ('HR 06 GH 5531', (SELECT slot_id FROM slot WHERE slot_code = 'G-59'), now() - INTERVAL '6 hours')
  RETURNING session_id INTO v_sid;
  UPDATE parking_session SET exit_time = now() - INTERVAL '2 hours 20 minutes' WHERE session_id = v_sid;

  -- Failed payment (1 row)
  INSERT INTO parking_session (plate_no, slot_id, entry_time)
  VALUES ('HR 06 JK 8801', (SELECT slot_id FROM slot WHERE slot_code = 'G-60'), now() - INTERVAL '3 hours 30 minutes')
  RETURNING session_id INTO v_sid;
  UPDATE parking_session SET exit_time = now() - INTERVAL '2 hours' WHERE session_id = v_sid;
  UPDATE payment SET status = 'FAILED', method = 'UPI' WHERE session_id = v_sid;

  -- Recent PAID exits from prototypes
  INSERT INTO parking_session (plate_no, slot_id, entry_time)
  VALUES ('HR 26 MN 6612', (SELECT slot_id FROM slot WHERE slot_code = 'G-55'), now() - INTERVAL '3 hours 40 minutes')
  RETURNING session_id INTO v_sid;
  UPDATE parking_session SET exit_time = now() - INTERVAL '1 hour 10 minutes' WHERE session_id = v_sid;
  UPDATE payment SET status = 'PAID', method = 'UPI', paid_at = now() - INTERVAL '1 hour 10 minutes' WHERE session_id = v_sid;

  INSERT INTO parking_session (plate_no, slot_id, entry_time)
  VALUES ('DL 3C KT 4410', (SELECT slot_id FROM slot WHERE slot_code = 'G-56'), now() - INTERVAL '4 hours 30 minutes')
  RETURNING session_id INTO v_sid;
  UPDATE parking_session SET exit_time = now() - INTERVAL '50 minutes' WHERE session_id = v_sid;
  UPDATE payment SET status = 'PAID', method = 'CARD', paid_at = now() - INTERVAL '50 minutes' WHERE session_id = v_sid;

  INSERT INTO parking_session (plate_no, slot_id, entry_time)
  VALUES ('HR 99 R 0456', (SELECT slot_id FROM slot WHERE slot_code = 'G-31'), now() - INTERVAL '1 hour 15 minutes')
  RETURNING session_id INTO v_sid;
  UPDATE parking_session SET exit_time = now() - INTERVAL '25 minutes' WHERE session_id = v_sid;
  UPDATE payment SET status = 'PAID', method = 'CASH', amount = 40, paid_at = now() - INTERVAL '25 minutes' WHERE session_id = v_sid;

  INSERT INTO parking_session (plate_no, slot_id, entry_time)
  VALUES ('HR 06 BQ 2210', (SELECT slot_id FROM slot WHERE slot_code = 'G-07'), now() - INTERVAL '1 hour 45 minutes')
  RETURNING session_id INTO v_sid;
  UPDATE parking_session SET exit_time = now() - INTERVAL '12 minutes' WHERE session_id = v_sid;
  UPDATE payment SET status = 'PAID', method = 'UPI', paid_at = now() - INTERVAL '12 minutes' WHERE session_id = v_sid;
END;
$$;

-- 7. Three reservations (trigger sets their slots to RESERVED)
-- Two reservations created > 30 mins ago (unclaimed alert = 2), one recent reservation for PB 65 K 7312
INSERT INTO reservation (plate_no, slot_id, created_at, expires_at) VALUES
  ('HR 06 PQ 1163', (SELECT slot_id FROM slot WHERE slot_code = 'G-05'),  now() - INTERVAL '45 minutes', now() + INTERVAL '15 minutes'),
  ('DL 3C BV 5520', (SELECT slot_id FROM slot WHERE slot_code = 'L2-04'), now() - INTERVAL '40 minutes', now() + INTERVAL '20 minutes'),
  ('PB 65 K 7312',  (SELECT slot_id FROM slot WHERE slot_code = 'L1-03'), now() - INTERVAL '18 minutes', now() + INTERVAL '22 minutes');

-- 8. Open sessions (142 open sessions across the three floors: 54 on G, 52 on L1, 36 on L2)
-- First, the 5 named active sessions from the prototypes:
INSERT INTO parking_session (plate_no, slot_id, entry_time) VALUES
  ('HR 06 MN 7788', (SELECT slot_id FROM slot WHERE slot_code = 'L1-40'), now() - INTERVAL '305 minutes'),
  ('UP 14 BT 2204', (SELECT slot_id FROM slot WHERE slot_code = 'G-48'),  now() - INTERVAL '190 minutes'),
  ('HR 06 CD 3380', (SELECT slot_id FROM slot WHERE slot_code = 'G-12'),  now() - INTERVAL '95 minutes'),
  ('DL 8C AF 1099', (SELECT slot_id FROM slot WHERE slot_code = 'L2-22'), now() - INTERVAL '15 minutes'),
  ('HR 06 AK 4821', (SELECT slot_id FROM slot WHERE slot_code = 'L1-14'), now() - INTERVAL '8 minutes');

-- Next, 137 additional open sessions on remaining FREE slots across Ground (52 more -> 54), L1 (50 more -> 52), L2 (35 more -> 36)
-- Include 3 overstays (> 12 hours) so the overstay alert count is 3; the rest spread over the last 10 hours.
WITH target_slots AS (
  SELECT slot_id, floor_id,
         ROW_NUMBER() OVER (PARTITION BY floor_id ORDER BY slot_no) AS rn_floor
  FROM slot
  WHERE status = 'FREE'
),
chosen_slots AS (
  SELECT slot_id,
         ROW_NUMBER() OVER (ORDER BY floor_id, rn_floor) AS seq
  FROM target_slots
  WHERE (floor_id = 1 AND rn_floor <= 52)
     OR (floor_id = 2 AND rn_floor <= 50)
     OR (floor_id = 3 AND rn_floor <= 35)
)
INSERT INTO parking_session (plate_no, slot_id, entry_time)
SELECT
  'HR 06 XX ' || (1000 + cs.seq)::TEXT,
  cs.slot_id,
  CASE
    WHEN cs.seq <= 3 THEN now() - INTERVAL '13 hours' - (cs.seq * 20 || ' minutes')::INTERVAL
    ELSE now() - ((15 + (cs.seq * 4) % 560) || ' minutes')::INTERVAL
  END
FROM chosen_slots cs
ORDER BY cs.seq;
