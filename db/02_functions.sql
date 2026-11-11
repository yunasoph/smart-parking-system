-- 02_functions.sql: Stored functions for fee calculation and billed hours

CREATE OR REPLACE FUNCTION fn_hours_billed(p_session INT)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  v_minutes NUMERIC;
BEGIN
  SELECT FLOOR(EXTRACT(EPOCH FROM (COALESCE(ps.exit_time, now()) - ps.entry_time)) / 60)
    INTO v_minutes
    FROM parking_session ps
   WHERE ps.session_id = p_session;

  IF v_minutes IS NULL THEN
    RETURN 0;
  END IF;

  RETURN GREATEST(1, CEIL(v_minutes / 60.0))::INT;
END;
$$;

CREATE OR REPLACE FUNCTION calc_fee(p_session INT)
RETURNS NUMERIC
LANGUAGE plpgsql
AS $$
DECLARE
  v_plan       VARCHAR(15);
  v_first_hour NUMERIC(6,2);
  v_extra_hour NUMERIC(6,2);
  v_hours      INT;
BEGIN
  SELECT v.plan, t.first_hour, t.extra_hour
    INTO v_plan, v_first_hour, v_extra_hour
    FROM parking_session ps
    JOIN vehicle v ON v.plate_no = ps.plate_no
    JOIN tariff t  ON t.type_id  = v.type_id
   WHERE ps.session_id = p_session;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  IF v_plan = 'MONTHLY' THEN
    RETURN 0;
  END IF;

  v_hours := fn_hours_billed(p_session);

  RETURN v_first_hour + (v_hours - 1) * v_extra_hour;
END;
$$;
