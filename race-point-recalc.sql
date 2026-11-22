-- AvilonX Clocking: editing a race point recalculates the results.
--
-- Each race entry keeps its distance (race release point to the member's loft),
-- worked out when the entry was made, and every speed and rank is worked out
-- from that distance. So when a race point's location or coordinates are
-- corrected:
--   1. every race using that race point (open or closed) takes the new name and
--      coordinates, and
--   2. every entry of those races gets its distance worked out again (same
--      formula as the website), from the new release point to the member's loft.
-- Speeds and ranks follow at once on Results, Race day and the public results,
-- clocked birds included. A race's own release coordinates changed directly are
-- handled the same way. Each change is in the Change history.
--
-- Run after multi-club.sql and before race-day.sql. Safe to run again.

-- Distance in metres between two points (haversine, the Earth's mean radius),
-- rounded to the millimetre: the same as distanceMeters() in the website.
CREATE OR REPLACE FUNCTION public.loft_distance_m(lat1 double precision, lon1 double precision, lat2 double precision, lon2 double precision)
RETURNS numeric LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = '' AS $$
  SELECT round((6371008.8 * 2 * atan2(sqrt(a), sqrt(1 - a)))::numeric, 3)
  FROM (SELECT power(sin(radians(lat2 - lat1) / 2), 2)
             + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lon2 - lon1) / 2), 2) AS a) AS s
$$;

-- Works out again the distance of every entry of one race. Returns how many
-- entries changed. Entries whose member has no loft coordinates are left as they are.
CREATE OR REPLACE FUNCTION public.recalculate_race_distances(p_race_id bigint)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_changed integer;
BEGIN
  UPDATE public.race_entries AS e
     SET distance_m = public.loft_distance_m(r.release_latitude, r.release_longitude, m.latitude, m.longitude)
    FROM public.races AS r, public.members AS m
   WHERE e.race_id = p_race_id
     AND r.id = e.race_id
     AND m.id = e.member_id
     AND m.latitude IS NOT NULL AND m.longitude IS NOT NULL
     AND e.distance_m IS DISTINCT FROM public.loft_distance_m(r.release_latitude, r.release_longitude, m.latitude, m.longitude);
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
-- point are found by the point's old name in the same club, and linked.
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
            OR (r.race_point_id IS NULL AND r.release_location = OLD.location AND r.club_id = NEW.club_id))
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
