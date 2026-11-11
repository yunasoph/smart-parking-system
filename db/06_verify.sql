-- 06_verify.sql: Verification checks proving database business rules hold

-- Check 1: inserting a second open session for an occupied slot fails
DO $$
DECLARE
  v_occupied_slot_id INT;
  v_free_plate       VARCHAR(15);
BEGIN
  SELECT slot_id INTO v_occupied_slot_id
    FROM parking_session
   WHERE exit_time IS NULL
   LIMIT 1;

  SELECT v.plate_no INTO v_free_plate
    FROM vehicle v
   WHERE NOT EXISTS (
     SELECT 1 FROM parking_session ps
      WHERE ps.plate_no = v.plate_no AND ps.exit_time IS NULL
   )
   LIMIT 1;

  BEGIN
    INSERT INTO parking_session (plate_no, slot_id)
    VALUES (v_free_plate, v_occupied_slot_id);

    RAISE NOTICE 'FAIL 1: inserting a second open session for an occupied slot succeeded';
  EXCEPTION
    WHEN unique_violation THEN
      RAISE NOTICE 'PASS 1: inserting a second open session for an occupied slot fails (unique_violation)';
  END;
END;
$$;

-- Check 2: inserting a second open session for a parked plate fails
DO $$
DECLARE
  v_parked_plate VARCHAR(15);
  v_free_slot_id INT;
BEGIN
  SELECT plate_no INTO v_parked_plate
    FROM parking_session
   WHERE exit_time IS NULL
   LIMIT 1;

  SELECT slot_id INTO v_free_slot_id
    FROM slot
   WHERE status = 'FREE'
   LIMIT 1;

  BEGIN
    INSERT INTO parking_session (plate_no, slot_id)
    VALUES (v_parked_plate, v_free_slot_id);

    RAISE NOTICE 'FAIL 2: inserting a second open session for a parked plate succeeded';
  EXCEPTION
    WHEN unique_violation THEN
      RAISE NOTICE 'PASS 2: inserting a second open session for a parked plate fails (unique_violation)';
  END;
END;
$$;

-- Check 3: a slot with status BROKEN is rejected
DO $$
DECLARE
  v_slot_id INT;
BEGIN
  SELECT slot_id INTO v_slot_id FROM slot LIMIT 1;

  BEGIN
    UPDATE slot SET status = 'BROKEN' WHERE slot_id = v_slot_id;

    RAISE NOTICE 'FAIL 3: a slot with status BROKEN was accepted';
  EXCEPTION
    WHEN check_violation THEN
      RAISE NOTICE 'PASS 3: a slot with status BROKEN is rejected (check_violation)';
  END;
END;
$$;

-- Check 4 & 5: closing a session sets the slot back to FREE and creates one PENDING payment;
--              paying the same session twice fails
DO $$
DECLARE
  v_free_slot_id INT;
  v_free_plate   VARCHAR(15);
  v_session_id   INT;
  v_slot_status  VARCHAR(12);
  v_pay_count    INT;
  v_pay_status   VARCHAR(10);
BEGIN
  SELECT slot_id INTO v_free_slot_id
    FROM slot
   WHERE status = 'FREE'
   ORDER BY slot_id DESC
   LIMIT 1;

  SELECT v.plate_no INTO v_free_plate
    FROM vehicle v
    JOIN vehicle_type vt ON vt.type_id = v.type_id
   WHERE vt.type_name = 'Car'
     AND v.plan = 'PAY_PER_HOUR'
     AND NOT EXISTS (
       SELECT 1 FROM parking_session ps
        WHERE ps.plate_no = v.plate_no AND ps.exit_time IS NULL
     )
   LIMIT 1;

  INSERT INTO parking_session (plate_no, slot_id, entry_time)
  VALUES (v_free_plate, v_free_slot_id, now() - INTERVAL '45 minutes')
  RETURNING session_id INTO v_session_id;

  -- Close the session
  UPDATE parking_session
     SET exit_time = now()
   WHERE session_id = v_session_id;

  SELECT status INTO v_slot_status FROM slot WHERE slot_id = v_free_slot_id;
  SELECT COUNT(*), MAX(status) INTO v_pay_count, v_pay_status
    FROM payment
   WHERE session_id = v_session_id;

  IF v_slot_status = 'FREE' AND v_pay_count = 1 AND v_pay_status = 'PENDING' THEN
    RAISE NOTICE 'PASS 4: closing a session sets the slot back to FREE and creates one PENDING payment';
  ELSE
    RAISE NOTICE 'FAIL 4: slot status=%, payment count=%, payment status=%', v_slot_status, v_pay_count, v_pay_status;
  END IF;

  -- Check 5: inserting a second payment for the same session fails
  BEGIN
    INSERT INTO payment (session_id, amount, method, status)
    VALUES (v_session_id, 40, 'UPI', 'PAID');

    RAISE NOTICE 'FAIL 5: paying the same session twice succeeded';
  EXCEPTION
    WHEN unique_violation THEN
      RAISE NOTICE 'PASS 5: paying the same session twice fails (unique_violation on payment.session_id)';
  END;

  -- Clean up test rows so seed data stays exact
  DELETE FROM payment WHERE session_id = v_session_id;
  DELETE FROM parking_session WHERE session_id = v_session_id;
END;
$$;

-- Check 6: calc_fee returns 40 for a Car parked 30 minutes, 70 for 90 minutes, 100 for 2 h 10 m
DO $$
DECLARE
  v_free_slot_id INT;
  v_car_plate    VARCHAR(15);
  v_sid          INT;
  v_fee_30       NUMERIC;
  v_fee_90       NUMERIC;
  v_fee_130      NUMERIC;
  v_base_time    TIMESTAMP := TIMESTAMP '2026-11-10 10:00:00';
BEGIN
  SELECT slot_id INTO v_free_slot_id
    FROM slot
   WHERE status = 'FREE'
   ORDER BY slot_id DESC
   LIMIT 1;

  SELECT v.plate_no INTO v_car_plate
    FROM vehicle v
    JOIN vehicle_type vt ON vt.type_id = v.type_id
   WHERE vt.type_name = 'Car'
     AND v.plan = 'PAY_PER_HOUR'
     AND NOT EXISTS (
       SELECT 1 FROM parking_session ps
        WHERE ps.plate_no = v.plate_no AND ps.exit_time IS NULL
     )
   LIMIT 1;

  -- 30 minutes
  INSERT INTO parking_session (plate_no, slot_id, entry_time, exit_time)
  VALUES (v_car_plate, v_free_slot_id, v_base_time, v_base_time + INTERVAL '30 minutes')
  RETURNING session_id INTO v_sid;
  v_fee_30 := calc_fee(v_sid);
  DELETE FROM parking_session WHERE session_id = v_sid;

  -- 90 minutes
  INSERT INTO parking_session (plate_no, slot_id, entry_time, exit_time)
  VALUES (v_car_plate, v_free_slot_id, v_base_time, v_base_time + INTERVAL '90 minutes')
  RETURNING session_id INTO v_sid;
  v_fee_90 := calc_fee(v_sid);
  DELETE FROM parking_session WHERE session_id = v_sid;

  -- 2 h 10 m (130 minutes)
  INSERT INTO parking_session (plate_no, slot_id, entry_time, exit_time)
  VALUES (v_car_plate, v_free_slot_id, v_base_time, v_base_time + INTERVAL '2 hours 10 minutes')
  RETURNING session_id INTO v_sid;
  v_fee_130 := calc_fee(v_sid);
  DELETE FROM parking_session WHERE session_id = v_sid;

  IF v_fee_30 = 40 AND v_fee_90 = 70 AND v_fee_130 = 100 THEN
    RAISE NOTICE 'PASS 6: calc_fee returns % for 30 min, % for 90 min, % for 2 h 10 m', v_fee_30, v_fee_90, v_fee_130;
  ELSE
    RAISE NOTICE 'FAIL 6: calc_fee returned % (expected 40), % (expected 70), % (expected 100)', v_fee_30, v_fee_90, v_fee_130;
  END IF;
END;
$$;

-- Check 7: a PARKER row without owner_id is rejected
DO $$
BEGIN
  BEGIN
    INSERT INTO app_user (email, password_hash, full_name, role, owner_id)
    VALUES ('noowner@parksmart.test', 'hash', 'No Owner Parker', 'PARKER', NULL);

    RAISE NOTICE 'FAIL 7: a PARKER row without owner_id was accepted';
  EXCEPTION
    WHEN check_violation THEN
      RAISE NOTICE 'PASS 7: a PARKER row without owner_id is rejected (check_violation)';
  END;
END;
$$;

-- Check 8: a bad role in app_user is rejected
DO $$
BEGIN
  BEGIN
    INSERT INTO app_user (email, password_hash, full_name, role, owner_id)
    VALUES ('badrole@parksmart.test', 'hash', 'Bad Role User', 'MANAGER', NULL);

    RAISE NOTICE 'FAIL 8: a bad role in app_user was accepted';
  EXCEPTION
    WHEN check_violation THEN
      RAISE NOTICE 'PASS 8: a bad role in app_user is rejected (check_violation)';
  END;
END;
$$;

-- Check 9: a duplicate email in app_user is rejected
DO $$
BEGIN
  BEGIN
    INSERT INTO app_user (email, password_hash, full_name, role, owner_id)
    VALUES ('admin@parksmart.test', 'hash', 'Duplicate Admin', 'ADMIN', NULL);

    RAISE NOTICE 'FAIL 9: a duplicate email in app_user was accepted';
  EXCEPTION
    WHEN unique_violation THEN
      RAISE NOTICE 'PASS 9: a duplicate email in app_user is rejected (unique_violation)';
  END;
END;
$$;
