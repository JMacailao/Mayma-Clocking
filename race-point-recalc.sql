-- AvilonX Clocking: editing a race point recalculates the results.
--
-- Each race entry keeps its distance (race release point to the member's loft),
-- worked out when the entry was made, and every speed and rank is worked out
-- from that distance. So when a race point's location or coordinates are
-- corrected:
--   1. every race using that race point (open or closed) takes the new name and
--      coordinates, and
--   2. every entry of those races gets its distance worked out again (same
--      formula as the website), from the new release point to the loft the
--      bird flew to in that race (kept on the entry; see below).
-- Speeds and ranks follow at once on Results, Race day and the public results,
-- clocked birds included. A race's own release coordinates changed directly are
-- handled the same way. Each change is in the Change history.
--
-- Run after multi-club.sql and before race-day.sql. Safe to run again.

-- Each entry keeps the loft coordinates it was entered with, so a member who
-- moves loft later does not change the distances of earlier races. Filled in
-- by itself on every new entry. For entries made before this file, it is
-- filled in only when the member's current loft still gives the entry's
-- distance; otherwise the loft at that time is not known, and those entries
-- keep their distance when a race point is edited.
ALTER TABLE public.race_entries ADD COLUMN IF NOT EXISTS loft_latitude numeric(10,7);
ALTER TABLE public.race_entries ADD COLUMN IF NOT EXISTS loft_longitude numeric(10,7);

-- Distance in metres between two points (haversine, the Earth's mean radius),
-- rounded to the millimetre: the same as distanceMeters() in the website.
CREATE OR REPLACE FUNCTION public.loft_distance_m(lat1 double precision, lon1 double precision, lat2 double precision, lon2 double precision)
RETURNS numeric LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = '' AS $$
  SELECT round((6371008.8 * 2 * atan2(sqrt(a), sqrt(1 - a)))::numeric, 3)
  FROM (SELECT power(sin(radians(lat2 - lat1) / 2), 2)
             + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lon2 - lon1) / 2), 2) AS a) AS s
$$;

CREATE OR REPLACE FUNCTION public._race_entry_keep_loft()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.loft_latitude IS NULL OR NEW.loft_longitude IS NULL THEN
    SELECT m.latitude, m.longitude INTO NEW.loft_latitude, NEW.loft_longitude
      FROM public.members AS m WHERE m.id = NEW.member_id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS race_entries_e_keep_loft ON public.race_entries;
CREATE TRIGGER race_entries_e_keep_loft
  BEFORE INSERT OR UPDATE OF member_id ON public.race_entries
  FOR EACH ROW EXECUTE FUNCTION public._race_entry_keep_loft();

-- Earlier entries: the member's current loft, only where it gives the entry's
-- distance (within a metre). This one-time fill-in is not a change anyone
-- made, so it is kept out of the Change history.
DO $$
DECLARE
  v_audit boolean := EXISTS (SELECT 1 FROM pg_catalog.pg_trigger
                             WHERE tgrelid = 'public.race_entries'::regclass AND tgname = 'zz_audit_change');
BEGIN
  IF v_audit THEN EXECUTE 'ALTER TABLE public.race_entries DISABLE TRIGGER zz_audit_change'; END IF;
  UPDATE public.race_entries AS e
     SET loft_latitude = m.latitude, loft_longitude = m.longitude
    FROM public.races AS r, public.members AS m
   WHERE e.loft_latitude IS NULL
     AND r.id = e.race_id AND m.id = e.member_id
     AND m.latitude IS NOT NULL AND m.longitude IS NOT NULL
     AND abs(public.loft_distance_m(r.release_latitude, r.release_longitude, m.latitude, m.longitude) - e.distance_m) <= 1;
  IF v_audit THEN EXECUTE 'ALTER TABLE public.race_entries ENABLE TRIGGER zz_audit_change'; END IF;
END $$;

-- Works out again the distance of every entry of one race. Returns how many
-- entries changed. Entries whose loft is not known are left as they are.
CREATE OR REPLACE FUNCTION public.recalculate_race_distances(p_race_id bigint)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_changed integer;
BEGIN
  UPDATE public.race_entries AS e
     SET distance_m = public.loft_distance_m(r.release_latitude, r.release_longitude, e.loft_latitude, e.loft_longitude)
    FROM public.races AS r
   WHERE e.race_id = p_race_id
     AND r.id = e.race_id
     AND e.loft_latitude IS NOT NULL AND e.loft_longitude IS NOT NULL
     AND e.distance_m IS DISTINCT FROM public.loft_distance_m(r.release_latitude, r.release_longitude, e.loft_latitude, e.loft_longitude);
  GET DIAGNOSTICS v_changed = ROW_COUNT;
  RETURN v_changed;
END;
$$;
REVOKE ALL ON FUNCTION public.recalculate_race_distances(bigint) FROM PUBLIC, anon, authenticated;

-- A race's release coordinates changed: its entries' distances follow.
CREATE OR REPLACE FUNCTION public._race_release_point_moved()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.release_latitude IS DISTINCT FROM OLD.release_latitude
     OR NEW.release_longitude IS DISTINCT FROM OLD.release_longitude THEN
    PERFORM public.recalculate_race_distances(NEW.id);
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS races_recalculate_distances ON public.races;
CREATE TRIGGER races_recalculate_distances
  AFTER UPDATE OF release_latitude, release_longitude ON public.races
  FOR EACH ROW EXECUTE FUNCTION public._race_release_point_moved();

-- A race point's name or coordinates changed: the races using it follow (which
-- recalculates their entries). Races made before races were linked to a race
-- point are found by the point's old name AND old coordinates in the same club
-- (so another point with the same name is not touched), and linked.
CREATE OR REPLACE FUNCTION public._race_point_moved()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.location IS DISTINCT FROM OLD.location
     OR NEW.latitude IS DISTINCT FROM OLD.latitude
     OR NEW.longitude IS DISTINCT FROM OLD.longitude THEN
    UPDATE public.races AS r
       SET race_point_id = coalesce(r.race_point_id, NEW.id),
           release_location = NEW.location,
           release_latitude = NEW.latitude,
           release_longitude = NEW.longitude
     WHERE (r.race_point_id = NEW.id
            OR (r.race_point_id IS NULL AND r.release_location = OLD.location AND r.club_id = NEW.club_id
                AND r.release_latitude = OLD.latitude AND r.release_longitude = OLD.longitude))
       AND (r.release_location IS DISTINCT FROM NEW.location
            OR r.release_latitude IS DISTINCT FROM NEW.latitude
            OR r.release_longitude IS DISTINCT FROM NEW.longitude);
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS race_points_update_races ON public.race_points;
CREATE TRIGGER race_points_update_races
  AFTER UPDATE OF location, latitude, longitude ON public.race_points
  FOR EACH ROW EXECUTE FUNCTION public._race_point_moved();

NOTIFY pgrst, 'reload schema';
