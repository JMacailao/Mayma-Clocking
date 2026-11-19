-- AvilonX Clocking: birds bonded by ring number only (sticker birds).
--
-- On Band Assignments, the "Ring number only" tab bonds a bird without an RFID
-- tag: ring number, loft, bird name, colour and photo. Such a bird can be
-- entered only on Race entries → Sticker entries (ring number + sticker) and
-- is clocked with its sticker. Birds bonded with an RFID tag work as before.
--
-- Run after bird-bonding.sql. Safe to run again.

ALTER TABLE public.pigeons ADD COLUMN IF NOT EXISTS bond_type text NOT NULL DEFAULT 'rfid';
ALTER TABLE public.pigeons DROP CONSTRAINT IF EXISTS pigeons_bond_type_valid;
ALTER TABLE public.pigeons ADD CONSTRAINT pigeons_bond_type_valid CHECK (bond_type IN ('rfid', 'ring'));

-- RFID birds need their tag while active; ring-only birds have none.
ALTER TABLE public.pigeons DROP CONSTRAINT IF EXISTS pigeons_active_needs_nfc_tag;
ALTER TABLE public.pigeons ADD CONSTRAINT pigeons_active_needs_nfc_tag CHECK (
  (bond_type = 'ring' AND nfc_tag IS NULL)
  OR (bond_type = 'rfid' AND (status <> 'active' OR nfc_tag IS NOT NULL))
) NOT VALID;

-- Race entries from a bonded bird: a ring-only bird is entered with its ring
-- and sticker, never with an RFID tag.
CREATE OR REPLACE FUNCTION public._race_entry_from_bonded_pigeon()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_pigeon public.pigeons%ROWTYPE;
  v_race_club bigint;
BEGIN
  IF NEW.pigeon_id IS NULL THEN
    RAISE EXCEPTION 'Choose a bonded bird. Bond the bird (ring, loft, name, colour and photo) on Band Assignments first.' USING ERRCODE = '22023';
  END IF;
  SELECT p.* INTO v_pigeon FROM public.pigeons AS p WHERE p.id = NEW.pigeon_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'That bonded bird was not found.' USING ERRCODE = '22023'; END IF;
  IF v_pigeon.status <> 'active' THEN
    RAISE EXCEPTION 'Bird % is retired and cannot be entered in a race.', v_pigeon.ring_number USING ERRCODE = '22023';
  END IF;
  IF v_pigeon.nfc_tag IS NULL AND v_pigeon.bond_type <> 'ring' THEN
    RAISE EXCEPTION 'Bird % has no RFID tag. Add its tag on Band Assignments first.', v_pigeon.ring_number USING ERRCODE = '22023';
  END IF;
  SELECT r.club_id INTO v_race_club FROM public.races AS r WHERE r.id = NEW.race_id;
  IF v_race_club IS DISTINCT FROM v_pigeon.club_id THEN
    RAISE EXCEPTION 'Bird % belongs to another club.', v_pigeon.ring_number USING ERRCODE = '22023';
  END IF;
  IF NEW.member_id IS NOT NULL AND NEW.member_id <> v_pigeon.member_id THEN
    RAISE EXCEPTION 'Bird % is bonded to another member.', v_pigeon.ring_number USING ERRCODE = '22023';
  END IF;
  NEW.member_id := v_pigeon.member_id;
  NEW.pigeon_ring := v_pigeon.ring_number;
  IF v_pigeon.bond_type = 'ring' THEN
    IF NEW.barcode IS NULL OR btrim(NEW.barcode) = '' THEN
      RAISE EXCEPTION 'Bird % is bonded by ring number only: scan or type its sticker.', v_pigeon.ring_number USING ERRCODE = '22023';
    END IF;
    NEW.nfc_tag := NULL;
    NEW.nfc_read_with := NULL;
  ELSIF v_pigeon.nfc_tag IS NOT NULL THEN
    NEW.nfc_tag := v_pigeon.nfc_tag;
    NEW.nfc_read_with := coalesce(NEW.nfc_read_with, v_pigeon.nfc_read_with);
  END IF;
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
