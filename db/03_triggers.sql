-- 03_triggers.sql: Triggers for slot status synchronization and automatic pending payment creation

CREATE OR REPLACE FUNCTION fn_sync_slot_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.exit_time IS NULL THEN
      UPDATE slot
         SET status = 'OCCUPIED'
       WHERE slot_id = NEW.slot_id;

      DELETE FROM reservation
       WHERE slot_id = NEW.slot_id
         AND plate_no = NEW.plate_no;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.exit_time IS NULL AND NEW.exit_time IS NOT NULL THEN
      UPDATE slot
         SET status = 'FREE'
       WHERE slot_id = NEW.slot_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_slot_status ON parking_session;
CREATE TRIGGER trg_sync_slot_status
AFTER INSERT OR UPDATE OF exit_time ON parking_session
FOR EACH ROW
EXECUTE FUNCTION fn_sync_slot_status();

CREATE OR REPLACE FUNCTION fn_create_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.exit_time IS NULL AND NEW.exit_time IS NOT NULL THEN
    INSERT INTO payment (session_id, amount, status, created_at)
    VALUES (NEW.session_id, calc_fee(NEW.session_id), 'PENDING', NEW.exit_time);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_payment ON parking_session;
CREATE TRIGGER trg_create_payment
AFTER UPDATE OF exit_time ON parking_session
FOR EACH ROW
EXECUTE FUNCTION fn_create_payment();

CREATE OR REPLACE FUNCTION fn_sync_reservation_slot()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE slot
       SET status = 'RESERVED'
     WHERE slot_id = NEW.slot_id
       AND status = 'FREE';
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE slot
       SET status = 'FREE'
     WHERE slot_id = OLD.slot_id
       AND status = 'RESERVED';
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_reservation_slot ON reservation;
CREATE TRIGGER trg_sync_reservation_slot
AFTER INSERT OR DELETE ON reservation
FOR EACH ROW
EXECUTE FUNCTION fn_sync_reservation_slot();
