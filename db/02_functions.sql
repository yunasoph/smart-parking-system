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

-- TRUE when the vehicle holds a monthly pass that is still valid at the end of the session
CREATE OR REPLACE FUNCTION fn_pass_active(p_session INT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (SELECT v.plan = 'MONTHLY'
            AND (v.pass_valid_until IS NULL
                 OR v.pass_valid_until >= COALESCE(ps.exit_time, now()))
       FROM parking_session ps
       JOIN vehicle v ON v.plate_no = ps.plate_no
      WHERE ps.session_id = p_session),
    FALSE);
$$;

-- Fee still owed for a session: hourly tariff (or 0 with a valid pass),
-- minus anything already paid in advance when the bay was booked.
CREATE OR REPLACE FUNCTION calc_fee(p_session INT)
RETURNS NUMERIC
LANGUAGE plpgsql
AS $$
DECLARE
  v_first_hour NUMERIC(6,2);
  v_extra_hour NUMERIC(6,2);
  v_prepaid    NUMERIC(8,2);
  v_hours      INT;
  v_gross      NUMERIC;
BEGIN
  SELECT t.first_hour, t.extra_hour, ps.prepaid_amount
    INTO v_first_hour, v_extra_hour, v_prepaid
    FROM parking_session ps
    JOIN vehicle v ON v.plate_no = ps.plate_no
    JOIN tariff t  ON t.type_id  = v.type_id
   WHERE ps.session_id = p_session;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  IF fn_pass_active(p_session) THEN
    v_gross := 0;
  ELSE
    v_hours := fn_hours_billed(p_session);
    v_gross := v_first_hour + (v_hours - 1) * v_extra_hour;
  END IF;

  RETURN GREATEST(0, v_gross - COALESCE(v_prepaid, 0));
END;
$$;
