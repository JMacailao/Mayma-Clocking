-- AvilonX Clocking: RFID tag expiry is set per race.
--
-- On Race schedules the club chooses "RFID tag expiry" for the race (for
-- example 3 days). It applies to every pigeon entered in that race with an
-- RFID tag: the tag stops clocking that many days after the official release
-- (or after the entry was saved, while the release is not set yet). After it,
-- the pigeon can still be clocked with its sticker, and its tag is free for
-- the next race. Race entries no longer choose an expiry per pigeon.
--
-- Changing the expiry or the release time of a race updates its entries.
--
-- Run after nfc-tags.sql. Safe to run again.

ALTER TABLE public.races ADD COLUMN IF NOT EXISTS nfc_expiry_days integer;
ALTER TABLE public.races DROP CONSTRAINT IF EXISTS races_nfc_expiry_days_valid;
ALTER TABLE public.races ADD CONSTRAINT races_nfc_expiry_days_valid
  CHECK (nfc_expiry_days IS NULL OR nfc_expiry_days BETWEEN 1 AND 365);

-- An entry's tag expiry, from its race.
CREATE OR REPLACE FUNCTION public._race_entry_tag_expiry(p_race_id bigint, p_nfc_tag text, p_created_at timestamptz)
RETURNS timestamptz LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE
    WHEN p_nfc_tag IS NULL OR r.nfc_expiry_days IS NULL THEN NULL
    ELSE coalesce(r.release_at_utc AT TIME ZONE 'UTC', p_created_at, now()) + make_interval(days => r.nfc_expiry_days)
  END
  FROM public.races AS r WHERE r.id = p_race_id;
$$;
REVOKE ALL ON FUNCTION public._race_entry_tag_expiry(bigint, text, timestamptz) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._race_entry_set_tag_expiry()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  NEW.nfc_expires_at := public._race_entry_tag_expiry(NEW.race_id, NEW.nfc_tag, coalesce(NEW.created_at, now()));
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._race_entry_set_tag_expiry() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS race_entries_d_tag_expiry ON public.race_entries;
CREATE TRIGGER race_entries_d_tag_expiry
  BEFORE INSERT OR UPDATE OF race_id, nfc_tag, nfc_expires_at ON public.race_entries
  FOR EACH ROW EXECUTE FUNCTION public._race_entry_set_tag_expiry();

-- The race's expiry or release changed: update its entries.
CREATE OR REPLACE FUNCTION public._race_update_tag_expiry()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.nfc_expiry_days IS DISTINCT FROM OLD.nfc_expiry_days OR NEW.release_at_utc IS DISTINCT FROM OLD.release_at_utc THEN
    UPDATE public.race_entries AS e
      SET nfc_expires_at = public._race_entry_tag_expiry(e.race_id, e.nfc_tag, e.created_at)
    WHERE e.race_id = NEW.id AND e.nfc_tag IS NOT NULL;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public._race_update_tag_expiry() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS races_tag_expiry ON public.races;
CREATE TRIGGER races_tag_expiry
  AFTER UPDATE OF nfc_expiry_days, release_at_utc ON public.races
  FOR EACH ROW EXECUTE FUNCTION public._race_update_tag_expiry();

NOTIFY pgrst, 'reload schema';
