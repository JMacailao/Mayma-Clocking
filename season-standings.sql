-- AvilonX Clocking: the member's loft reader status, and season standings.
--
--   * member_reader_status(): each loft reader of the signed-in member, online
--     or not, and how many taps it holds that are still waiting to be sent.
--   * season_standings(year): the club's standings for a year (Philippine time),
--     from CLOSED, non-practice races only. A clocking counts when it was not
--     rejected and, if the race needs Show up, was verified.
--       Loft points: in each race the loft's best bird scores by its place:
--       1st 10 points, 2nd 9, ... 10th 1.
--       Ace pigeons: birds clocked in 2 or more races, by average speed.
--
-- Run after rfid-devices.sql and show-up.sql. Safe to run again.

CREATE OR REPLACE FUNCTION public.member_reader_status()
RETURNS TABLE (name text, is_online boolean, last_heartbeat_at timestamptz, last_seen_at timestamptz, pending_taps integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT d.name::text, coalesce(d.last_heartbeat_at > now() - interval '3 minutes', false), d.last_heartbeat_at, d.last_seen_at, coalesce(d.pending_taps, 0)
  FROM public.rfid_devices AS d
  WHERE public.current_member_id() IS NOT NULL AND d.member_id = public.current_member_id()
  ORDER BY d.name;
$$;
REVOKE ALL ON FUNCTION public.member_reader_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_reader_status() TO authenticated;

CREATE OR REPLACE FUNCTION public.season_standings(p_year integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_club bigint := public.current_club_id();
  v_year integer := coalesce(p_year, extract(year FROM now() AT TIME ZONE 'Asia/Manila')::integer);
  v_out jsonb;
BEGIN
  IF v_club IS NULL THEN RAISE EXCEPTION 'Sign in with a club account.' USING ERRCODE = '42501'; END IF;
  WITH counted AS (
    SELECT r.id AS race_id, m.id AS member_id, m.full_name, m.loft_name, m.member_no,
      coalesce(e.pigeon_ring, k.pigeon_ring) AS ring,
      e.distance_m * 60 / extract(epoch FROM k.received_at_utc - r.release_at_utc) AS speed
    FROM public.races AS r
    JOIN public.race_entries AS e ON e.race_id = r.id
    JOIN public.members AS m ON m.id = e.member_id
    JOIN public.clock_events AS k ON k.race_entry_id = e.id
    WHERE r.club_id = v_club AND r.status = 'closed' AND NOT r.is_practice AND r.release_at_utc IS NOT NULL
      AND extract(year FROM (r.release_at_utc AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Manila') = v_year
      AND k.received_at_utc > r.release_at_utc
      AND k.verification <> 'rejected' AND NOT (r.requires_show_up AND k.verification <> 'verified')
  ), ranked AS (
    SELECT c.*, rank() OVER (PARTITION BY c.race_id ORDER BY c.speed DESC) AS place FROM counted AS c
  ), best AS (
    SELECT DISTINCT ON (race_id, member_id) race_id, member_id, place FROM ranked ORDER BY race_id, member_id, place
  ), lofts AS (
    SELECT m.id, m.full_name, m.loft_name, m.member_no,
      sum(greatest(0, 11 - b.place))::integer AS points,
      count(*) FILTER (WHERE b.place = 1)::integer AS wins,
      count(DISTINCT b.race_id)::integer AS races,
      (SELECT count(*) FROM ranked AS x WHERE x.member_id = m.id)::integer AS birds_clocked,
      (SELECT max(x.speed) FROM ranked AS x WHERE x.member_id = m.id) AS best_speed
    FROM best AS b JOIN public.members AS m ON m.id = b.member_id
    GROUP BY m.id, m.full_name, m.loft_name, m.member_no
  ), aces AS (
    SELECT ring, member_id, min(full_name) AS full_name, min(loft_name) AS loft_name, count(*)::integer AS races,
      avg(speed) AS average_speed, max(speed) AS best_speed, min(place)::integer AS best_place
    FROM ranked GROUP BY ring, member_id HAVING count(*) >= 2
  )
  SELECT jsonb_build_object(
    'year', v_year,
    'races', (SELECT count(DISTINCT race_id) FROM counted),
    'lofts', coalesce((SELECT jsonb_agg(to_jsonb(l) - 'id' || jsonb_build_object('member_id', l.id, 'best_speed', round(l.best_speed, 3)) ORDER BY l.points DESC, l.wins DESC, l.best_speed DESC) FROM lofts AS l), '[]'::jsonb),
    'aces', coalesce((SELECT jsonb_agg(jsonb_build_object('ring', a.ring, 'member_id', a.member_id, 'full_name', a.full_name, 'loft_name', a.loft_name, 'races', a.races,
              'average_speed', round(a.average_speed, 3), 'best_speed', round(a.best_speed, 3), 'best_place', a.best_place) ORDER BY a.average_speed DESC) FROM (SELECT * FROM aces ORDER BY average_speed DESC LIMIT 20) AS a), '[]'::jsonb),
    'years', coalesce((SELECT jsonb_agg(y ORDER BY y DESC) FROM (SELECT DISTINCT extract(year FROM (r.release_at_utc AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Manila')::integer AS y
              FROM public.races AS r WHERE r.club_id = v_club AND r.status = 'closed' AND r.release_at_utc IS NOT NULL) AS ys), '[]'::jsonb)
  ) INTO v_out;
  RETURN v_out;
END;
$$;
REVOKE ALL ON FUNCTION public.season_standings(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.season_standings(integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
