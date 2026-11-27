-- Deleting a race (Race schedules → Delete race).
--
-- * A race with no pigeons entered can always be deleted.
-- * A race with pigeons entered can be deleted only 6 months after its race
--   day (end date, else open date, else release day, Philippine time). Its
--   entries, clockings and clock videos are deleted with it. Billing counts
--   stay (non-refundable).
-- Safe to run again (part of avilonx-update.sql).

-- The race's day: end date, else open date, else the release day, else the day it was made.
CREATE OR REPLACE FUNCTION public.race_day(p_race public.races)
RETURNS date LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT coalesce(p_race.end_date, p_race.open_date,
    ((p_race.release_at_utc AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Manila')::date,
    (p_race.created_at AT TIME ZONE 'Asia/Manila')::date)
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_race(p_race_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_race public.races; v_entries integer; v_clocks integer; v_day date; v_allowed date;
BEGIN
  IF NOT public.can_manage_club_data() THEN RAISE EXCEPTION 'Club administrator or staff account required.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_race FROM public.races WHERE id = p_race_id AND club_id = public.current_club_id() FOR UPDATE;
  IF v_race.id IS NULL THEN RAISE EXCEPTION 'Race not found.' USING ERRCODE = '22023'; END IF;
  SELECT count(*) INTO v_entries FROM public.race_entries WHERE race_id = p_race_id;
  SELECT count(*) INTO v_clocks FROM public.clock_events c JOIN public.race_entries e ON e.id = c.race_entry_id WHERE e.race_id = p_race_id;
  IF v_entries > 0 THEN
    v_day := public.race_day(v_race);
    v_allowed := (v_day + interval '6 months')::date;
    IF v_allowed > (now() AT TIME ZONE 'Asia/Manila')::date THEN
      RAISE EXCEPTION 'This race has % pigeon% entered. A race with pigeons can be deleted 6 months after its race day (from %).',
        v_entries, CASE WHEN v_entries = 1 THEN '' ELSE 's' END, to_char(v_allowed, 'Mon DD, YYYY') USING ERRCODE = '22023';
    END IF;
  END IF;
  DELETE FROM public.clock_events c USING public.race_entries e WHERE e.id = c.race_entry_id AND e.race_id = p_race_id;
  DELETE FROM public.race_entries WHERE race_id = p_race_id;
  DELETE FROM public.races WHERE id = p_race_id;
  RETURN jsonb_build_object('entries', v_entries, 'clocks', v_clocks);
END;
$$;
REVOKE ALL ON FUNCTION public.race_day(public.races), public.admin_delete_race(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.race_day(public.races), public.admin_delete_race(bigint) TO authenticated;
