-- AvilonX Clocking: club settings (Administration → Club settings).
--
-- rfid_entry_sticker: does an RFID entry also need the pigeon's sticker?
--   'required' (default): every entry needs its sticker. Enforced here, so it
--                         holds for the entry form, Excel import and race sheets.
--   'optional':           an RFID entry may be saved without a sticker (the
--                         page warns first). Sticker entries and ring-only birds
--                         always need their sticker.
--
-- Only the club administrator changes the settings. Run after multi-club.sql.
-- Safe to run again.

ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS rfid_entry_sticker text NOT NULL DEFAULT 'required';
ALTER TABLE public.clubs DROP CONSTRAINT IF EXISTS clubs_rfid_entry_sticker_valid;
ALTER TABLE public.clubs ADD CONSTRAINT clubs_rfid_entry_sticker_valid CHECK (rfid_entry_sticker IN ('required', 'optional'));

CREATE OR REPLACE FUNCTION public.admin_update_club_settings(p_rfid_entry_sticker text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_club bigint := public.current_club_id();
BEGIN
  IF NOT public.is_app_admin() OR v_club IS NULL THEN
    RAISE EXCEPTION 'Only the club administrator can change the club settings.' USING ERRCODE = '42501';
  END IF;
  IF p_rfid_entry_sticker NOT IN ('required', 'optional') THEN
    RAISE EXCEPTION 'Choose required or optional.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.clubs SET rfid_entry_sticker = p_rfid_entry_sticker WHERE id = v_club;
  RETURN jsonb_build_object('rfid_entry_sticker', p_rfid_entry_sticker);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_update_club_settings(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_club_settings(text) TO authenticated;

-- New entries without a sticker, when the club requires it.
CREATE OR REPLACE FUNCTION public._race_entry_sticker_rule()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_rule text;
BEGIN
  IF NEW.barcode IS NULL OR btrim(NEW.barcode) = '' THEN
    SELECT c.rfid_entry_sticker INTO v_rule FROM public.races AS r JOIN public.clubs AS c ON c.id = r.club_id WHERE r.id = NEW.race_id;
    IF coalesce(v_rule, 'required') = 'required' THEN
      RAISE EXCEPTION 'This club requires the sticker for every entry. Scan or type the sticker reference number (Club settings can make it optional for RFID entries).' USING ERRCODE = '23514';
    END IF;
    IF NEW.nfc_tag IS NULL THEN
      RAISE EXCEPTION 'An entry without a sticker needs the bird''s RFID tag.' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._race_entry_sticker_rule() FROM PUBLIC, anon, authenticated;
-- After the bonded bird's tag is copied (race_entries_0_...), before the tag checks.
DROP TRIGGER IF EXISTS race_entries_1_sticker_rule ON public.race_entries;
CREATE TRIGGER race_entries_1_sticker_rule BEFORE INSERT ON public.race_entries
  FOR EACH ROW EXECUTE FUNCTION public._race_entry_sticker_rule();

NOTIFY pgrst, 'reload schema';
