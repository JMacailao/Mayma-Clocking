-- Public read-only race results. Run after schema.sql, supabase-auth.sql, and multi-club.sql.
-- Only club names and the requested result fields are exposed to unauthenticated visitors.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.clubs') IS NULL OR to_regclass('public.races') IS NULL
     OR to_regclass('public.race_entries') IS NULL OR to_regclass('public.clock_events') IS NULL
     OR to_regclass('public.members') IS NULL THEN
    RAISE EXCEPTION 'Run schema.sql, supabase-auth.sql, and multi-club.sql before public-results.sql.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.public_result_clubs()
RETURNS TABLE(club_id bigint, club_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT c.id, c.name::text
  FROM public.clubs AS c
  ORDER BY c.name;
$function$;

CREATE OR REPLACE FUNCTION public.public_race_results(p_club_id bigint, p_race_date date)
RETURNS TABLE(
  race_name text,
  loft_name text,
  distance_m numeric,
  pigeon_ring text,
  barcode text,
  arrival_at_utc timestamp without time zone,
  flight_seconds numeric,
  speed_m_per_min numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT
    r.name::text,
    m.loft_name::text,
    e.distance_m::numeric,
    COALESCE(e.pigeon_ring, c.pigeon_ring)::text,
    COALESCE(e.barcode, '')::text,
    c.received_at_utc,
    CASE
      WHEN c.received_at_utc > r.release_at_utc
        THEN EXTRACT(EPOCH FROM (c.received_at_utc - r.release_at_utc))
      ELSE NULL::numeric
    END,
    CASE
      WHEN c.received_at_utc > r.release_at_utc
        THEN e.distance_m * 60 / NULLIF(EXTRACT(EPOCH FROM (c.received_at_utc - r.release_at_utc)), 0)
      ELSE NULL::numeric
    END
  FROM public.clubs AS club
  JOIN public.races AS r ON r.club_id = club.id
  JOIN public.race_entries AS e ON e.race_id = r.id
  JOIN public.members AS m ON m.id = e.member_id AND m.club_id = club.id
  JOIN public.clock_events AS c ON c.race_entry_id = e.id
  WHERE club.id = p_club_id
    AND ((r.release_at_utc AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Manila')::date = p_race_date
    AND c.verification <> 'rejected'
  ORDER BY r.name, m.loft_name, e.pigeon_ring;
$function$;

REVOKE ALL ON FUNCTION public.public_result_clubs() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.public_race_results(bigint, date) FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_result_clubs() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_race_results(bigint, date) TO anon, authenticated;

COMMENT ON FUNCTION public.public_result_clubs() IS
  'Returns club names for the public results selector; exposes no member or account data.';
COMMENT ON FUNCTION public.public_race_results(bigint, date) IS
  'Returns non-rejected race result fields for a club and Philippines-local race date.';

COMMIT;
