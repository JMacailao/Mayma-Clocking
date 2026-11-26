-- Rules of the database, checked after schema.sql, supabase-auth.sql and
-- avilonx-update.sql (run twice). Each failure stops with an error.
\set ON_ERROR_STOP on

-- Every setup part reports done.
DO $$ DECLARE v jsonb := public.setup_status(); k text; BEGIN
  FOR k IN SELECT jsonb_object_keys(v) LOOP ASSERT (v->>k)::boolean, 'setup part not done: ' || k; END LOOP;
END $$;

-- Test data: a club, a member, two registered tags and stickers.
INSERT INTO public.clubs (name) VALUES ('Test club');
INSERT INTO public.members (member_no, full_name, loft_name, latitude, longitude, club_id) SELECT '161', 'Test member', 'Loft', 13, 121, id FROM public.clubs;
INSERT INTO public.nfc_tags (tag_uid, source) VALUES ('843519DB', 'legacy'), ('6C811F4A', 'legacy');
INSERT INTO public.barcode_stickers (barcode_number, source) VALUES ('111', 'manual'), ('222', 'manual'), ('333', 'manual'), ('444', 'manual');
INSERT INTO public.races (name, release_location, release_latitude, release_longitude, club_id, open_date, end_date, nfc_expiry_days)
  SELECT r, 'Point', 13, 121, (SELECT id FROM public.clubs), current_date, current_date + 2, 3 FROM unnest(ARRAY['Race A', 'Race B']) AS r;
INSERT INTO public.pigeons (club_id, member_id, ring_number, bird_name, color, loft_name, nfc_tag, photo_path, bond_type)
  SELECT c.id, m.id, x.ring, x.name, 'Blue', 'Loft', x.tag, 'x/y.jpg', x.bond FROM public.clubs c, public.members m,
  (VALUES ('PH-1', 'One', '843519DB', 'rfid'), ('PH-2', 'Two', NULL, 'ring'), ('PH-3', 'Three', '6C811F4A', 'rfid')) AS x(ring, name, tag, bond);

-- RFID tag expiry comes from the race.
INSERT INTO public.race_entries (race_id, member_id, pigeon_id, distance_m, barcode)
  SELECT r.id, p.member_id, p.id, 1000, '111' FROM public.races r, public.pigeons p WHERE r.name = 'Race A' AND p.ring_number = 'PH-1';
DO $$ DECLARE e record; BEGIN
  SELECT * INTO e FROM public.race_entries WHERE barcode = '111';
  ASSERT e.nfc_tag = '843519DB', 'the bonded tag is copied to the entry';
  ASSERT abs(extract(epoch FROM e.nfc_expires_at - e.created_at) - 3 * 86400) < 5, 'expiry = saved + 3 days while the release is not set';
END $$;
UPDATE public.races SET release_at_utc = (now() AT TIME ZONE 'UTC') + interval '1 day' WHERE name = 'Race A';
DO $$ BEGIN
  ASSERT (SELECT e.nfc_expires_at = (r.release_at_utc AT TIME ZONE 'UTC') + interval '3 days' FROM public.race_entries e JOIN public.races r ON r.id = e.race_id WHERE e.barcode = '111'), 'expiry = release + 3 days';
END $$;

-- An RFID tag is used once per race, and not while active in another race.
DO $$ BEGIN
  BEGIN
    INSERT INTO public.race_entries (race_id, member_id, pigeon_id, distance_m, barcode)
      SELECT r.id, p.member_id, p.id, 1000, '222' FROM public.races r, public.pigeons p WHERE r.name = 'Race B' AND p.ring_number = 'PH-1';
    RAISE EXCEPTION 'expected: tag still active in Race A';
  EXCEPTION WHEN check_violation THEN ASSERT SQLERRM LIKE '%still active in race "Race A"%', SQLERRM; END;
END $$;
UPDATE public.races SET status = 'closed' WHERE name = 'Race A';
INSERT INTO public.race_entries (race_id, member_id, pigeon_id, distance_m, barcode)
  SELECT r.id, p.member_id, p.id, 1000, '222' FROM public.races r, public.pigeons p WHERE r.name = 'Race B' AND p.ring_number = 'PH-1';

-- Ring-number-only birds: sticker required, never an RFID tag.
DO $$ BEGIN
  BEGIN
    INSERT INTO public.race_entries (race_id, member_id, pigeon_id, distance_m)
      SELECT r.id, p.member_id, p.id, 1000 FROM public.races r, public.pigeons p WHERE r.name = 'Race B' AND p.ring_number = 'PH-2';
    RAISE EXCEPTION 'expected: sticker required';
  EXCEPTION WHEN invalid_parameter_value THEN ASSERT SQLERRM LIKE '%scan or type its sticker%', SQLERRM; END;
END $$;
INSERT INTO public.race_entries (race_id, member_id, pigeon_id, distance_m, barcode, nfc_tag)
  SELECT r.id, p.member_id, p.id, 1000, '333', 'DEADBEEF' FROM public.races r, public.pigeons p WHERE r.name = 'Race B' AND p.ring_number = 'PH-2';
DO $$ BEGIN ASSERT (SELECT nfc_tag IS NULL FROM public.race_entries WHERE barcode = '333'), 'ring-only entries never keep a tag'; END $$;
DO $$ BEGIN
  BEGIN UPDATE public.pigeons SET nfc_tag = '6C811F4A' WHERE ring_number = 'PH-2'; RAISE EXCEPTION 'expected: ring-only bird cannot get a tag';
  EXCEPTION WHEN check_violation OR unique_violation THEN NULL; END;
END $$;

-- Club setting: the sticker is required by default; optional lets RFID entries
-- go without it (but never an entry with neither sticker nor tag).
DO $$ BEGIN
  BEGIN
    INSERT INTO public.race_entries (race_id, member_id, pigeon_id, distance_m)
      SELECT r.id, p.member_id, p.id, 1000 FROM public.races r, public.pigeons p WHERE r.name = 'Race B' AND p.ring_number = 'PH-3';
    RAISE EXCEPTION 'expected: sticker required';
  EXCEPTION WHEN check_violation THEN ASSERT SQLERRM LIKE '%requires the sticker%', SQLERRM; END;
  UPDATE public.clubs SET rfid_entry_sticker = 'optional';
  INSERT INTO public.race_entries (race_id, member_id, pigeon_id, distance_m)
    SELECT r.id, p.member_id, p.id, 1000 FROM public.races r, public.pigeons p WHERE r.name = 'Race B' AND p.ring_number = 'PH-3';
  ASSERT (SELECT nfc_tag FROM public.race_entries WHERE pigeon_id = (SELECT id FROM public.pigeons WHERE ring_number = 'PH-3')) = '6C811F4A', 'RFID entry saved without a sticker';
  UPDATE public.clubs SET rfid_entry_sticker = 'required';
END $$;

-- One device per account: a second device is asked first; forcing takes over.
DO $$ DECLARE v_user uuid; r jsonb; BEGIN
  INSERT INTO auth.users (email) VALUES ('device-test@users.mayma.invalid') RETURNING id INTO v_user;
  INSERT INTO public.app_profiles (id, role, username, club_id, is_active) SELECT v_user, 'admin', 'devicetest', id, true FROM public.clubs LIMIT 1;
  PERFORM set_config('request.jwt.claim.sub', v_user::text, true);
  ASSERT (public.claim_account_device('device-AAAA', 'Phone', false)->>'status') = 'ok', 'off by default: always ok';
  UPDATE public.clubs SET single_device = true;
  ASSERT (public.claim_account_device('device-AAAA', 'Phone', false)->>'status') = 'ok', 'first device';
  r := public.claim_account_device('device-BBBB', 'Laptop', false);
  ASSERT r->>'status' = 'other_device' AND r->>'device_label' = 'Phone', 'second device is asked: ' || r::text;
  ASSERT (public.check_account_device('device-AAAA')->>'status') = 'ok', 'first device still holds it';
  ASSERT (public.claim_account_device('device-BBBB', 'Laptop', true)->>'status') = 'ok', 'forcing takes over';
  ASSERT (public.check_account_device('device-AAAA')->>'status') = 'replaced', 'first device learns it was replaced';
  PERFORM public.release_account_device('device-BBBB');
  ASSERT (public.check_account_device('device-BBBB')->>'status') = 'unclaimed', 'signing out frees the account';
  UPDATE public.clubs SET single_device = false;
  PERFORM set_config('request.jwt.claim.sub', '', true);
END $$;

-- Telegram: only loft reader owners who connected Telegram get a message per clock.
DO $$ DECLARE v_member bigint; v_entry bigint; v_code text; r jsonb; BEGIN
  SELECT id INTO v_member FROM public.members WHERE member_no = '161';
  SELECT id INTO v_entry FROM public.race_entries WHERE barcode = '222';
  UPDATE public.members SET telegram_link_code = 'abcdef0123456789abcd', telegram_link_expires_at = now() + interval '5 minutes' WHERE id = v_member;
  r := public.telegram_link_by_code('abcdef0123456789abcd', 987654321);
  ASSERT (r->>'ok')::boolean, 'a valid code connects the chat';
  ASSERT NOT (public.telegram_link_by_code('abcdef0123456789abcd', 1)->>'ok')::boolean, 'a code works once';
  INSERT INTO public.clock_events (race_entry_id, pigeon_ring, received_at_utc, source, verification) VALUES (v_entry, 'PH-1', now() AT TIME ZONE 'UTC', 'barcode', 'provisional');
  ASSERT NOT EXISTS (SELECT 1 FROM public.telegram_outbox), 'no message without a loft reader';
  DELETE FROM public.clock_events WHERE race_entry_id = v_entry;
  INSERT INTO public.rfid_devices (club_id, serial, name, member_id, mode, key_hash) SELECT club_id, 'A1B2C3D4E5F6', 'Loft', v_member, 'clock', '\x00'::bytea FROM public.members WHERE id = v_member;
  INSERT INTO public.clock_events (race_entry_id, pigeon_ring, received_at_utc, source, verification) VALUES (v_entry, 'PH-1', now() AT TIME ZONE 'UTC', 'barcode', 'provisional');
  ASSERT (SELECT count(*) FROM public.telegram_outbox WHERE chat_id = 987654321) = 1, 'the reader owner gets one message';
  ASSERT (SELECT text FROM public.telegram_outbox LIMIT 1) LIKE '%PH-1 was clocked%Race: Race B%Clocked with: Sticker%', (SELECT text FROM public.telegram_outbox LIMIT 1);
  ASSERT public.telegram_unlink_chat(987654321) = 1, '/stop disconnects';
  DELETE FROM public.clock_events WHERE race_entry_id = v_entry;
  DELETE FROM public.rfid_devices WHERE serial = 'A1B2C3D4E5F6';
END $$;

-- Loading form box counts: defaults, and only sensible numbers.
DO $$ BEGIN
  ASSERT (SELECT form_member_boxes = 5 AND form_prefix_boxes = 6 AND form_number_boxes = 8 FROM public.clubs LIMIT 1), 'default box counts';
  BEGIN UPDATE public.clubs SET form_number_boxes = 0; RAISE EXCEPTION 'expected: at least one number box'; EXCEPTION WHEN check_violation THEN NULL; END;
END $$;

-- Change history records changes, and skips saves that change nothing.
DO $$ DECLARE before bigint := (SELECT count(*) FROM public.audit_log); BEGIN
  UPDATE public.races SET name = 'Race B2' WHERE name = 'Race B';
  UPDATE public.races SET name = 'Race B2' WHERE name = 'Race B2';
  ASSERT (SELECT count(*) FROM public.audit_log) = before + 1, 'one history row for one real change';
  ASSERT (SELECT changed_by_name FROM public.audit_log ORDER BY id DESC LIMIT 1) = 'RFID reader / system', 'records who changed it';
END $$;

-- Practice races never appear in the public results.
DO $$ BEGIN
  UPDATE public.races SET is_practice = true WHERE name = 'Race B2';
  ASSERT NOT EXISTS (SELECT 1 FROM public.public_race_results((SELECT id FROM public.clubs), current_date) WHERE race_name = 'Race B2'), 'practice race hidden';
END $$;

-- Editing a race point recalculates its races and their entries' distances
-- (also for clocked birds, and races linked only by the point's name).
INSERT INTO public.barcode_stickers (barcode_number, source) VALUES ('901', 'manual'), ('902', 'manual'), ('903', 'manual'), ('904', 'manual');
INSERT INTO public.race_points (location, sector, latitude, longitude, club_id) SELECT 'Lucena', 'South', 13.7565, 121.0583, id FROM public.clubs;
INSERT INTO public.races (name, race_point_id, release_location, release_latitude, release_longitude, club_id, open_date, end_date, release_at_utc, status)
  SELECT x.name, CASE WHEN x.linked THEN p.id END, x.loc, x.lat, x.lon, p.club_id, current_date - 1, current_date, (now() AT TIME ZONE 'UTC') - interval '3 hours', 'closed'
  FROM public.race_points p, (VALUES ('Race P', true, 'Lucena', 13.7565, 121.0583), ('Race L', false, 'Lucena', 13.7565, 121.0583), ('Race X', false, 'Elsewhere', 10.0, 120.0)) AS x(name, linked, loc, lat, lon)
  WHERE p.location = 'Lucena';
INSERT INTO public.race_entries (race_id, member_id, pigeon_id, distance_m, barcode)
  SELECT r.id, p.member_id, p.id, 1, x.code FROM public.pigeons p, public.races r JOIN (VALUES ('Race P', '901'), ('Race L', '902'), ('Race X', '903')) AS x(name, code) ON x.name = r.name
  WHERE p.ring_number = 'PH-2';
INSERT INTO public.clock_events (race_entry_id, pigeon_ring, received_at_utc, source, verification)
  SELECT id, 'PH-2', now() AT TIME ZONE 'UTC', 'barcode', 'verified' FROM public.race_entries WHERE barcode = '901';
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM public.race_entries WHERE barcode IN ('901', '902', '903') AND loft_latitude = 13 AND loft_longitude = 121) = 3, 'each entry keeps the loft it was entered with';
END $$;
-- Another point with the same name elsewhere, with an older race (not linked) at it.
INSERT INTO public.race_points (location, sector, latitude, longitude, club_id) SELECT 'Lucena', 'North', 14.1, 121.3, id FROM public.clubs;
INSERT INTO public.races (name, release_location, release_latitude, release_longitude, club_id, open_date, end_date, release_at_utc, status)
  SELECT 'Race N', 'Lucena', 14.1, 121.3, id, current_date - 1, current_date, (now() AT TIME ZONE 'UTC') - interval '3 hours', 'closed' FROM public.clubs;
INSERT INTO public.race_entries (race_id, member_id, pigeon_id, distance_m, barcode)
  SELECT r.id, p.member_id, p.id, 5, '904' FROM public.races r, public.pigeons p WHERE r.name = 'Race N' AND p.ring_number = 'PH-2';
-- The member moves loft later: their earlier races keep the old loft.
UPDATE public.members SET latitude = 10, longitude = 120;
UPDATE public.race_points SET location = 'Lucena City', latitude = 14.5995, longitude = 120.9842 WHERE location = 'Lucena' AND sector = 'South';
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM public.races WHERE name IN ('Race P', 'Race L') AND release_location = 'Lucena City'
          AND release_latitude = 14.5995 AND release_longitude = 120.9842 AND race_point_id IS NOT NULL) = 2, 'races using the point (also by name) take its new name and coordinates';
  -- 177864.714 m is what the website's distanceMeters() gives for these points.
  ASSERT (SELECT count(*) FROM public.race_entries WHERE barcode IN ('901', '902') AND distance_m = 177864.714) = 2, 'their entries get the new distance (clocked or not)';
  ASSERT (SELECT distance_m FROM public.race_entries WHERE barcode = '903') = 1, 'a race at another point is not touched';
  ASSERT (SELECT release_latitude = 14.1 AND release_location = 'Lucena' AND race_point_id IS NULL FROM public.races WHERE name = 'Race N'), 'an older race at another point with the same name is not moved';
  ASSERT (SELECT distance_m FROM public.race_entries WHERE barcode = '904') = 5, 'nor its entries';
  ASSERT (SELECT count(*) FROM public.audit_log WHERE table_name = 'race_entries' AND action = 'update') >= 2, 'the recalculation is in the change history';
END $$;
UPDATE public.races SET release_latitude = 13.7565, release_longitude = 121.0583 WHERE name = 'Race X';
DO $$ BEGIN
  ASSERT (SELECT distance_m FROM public.race_entries WHERE barcode = '903') = 84355.165, 'changing a race''s release coordinates recalculates its entries';
END $$;

-- Two race points with the same name: an unlinked race of that name may be the
-- other point's, so editing one of them leaves it alone.
INSERT INTO public.race_points (location, sector, latitude, longitude, club_id) SELECT 'Twin', x.sector, 12.0, 121.0, c.id FROM public.clubs c, (VALUES ('A'), ('B')) AS x(sector);
INSERT INTO public.races (name, release_location, release_latitude, release_longitude, club_id, open_date, end_date)
  SELECT 'Race T', 'Twin', 12.0, 121.0, id, current_date, current_date FROM public.clubs;
UPDATE public.race_points SET latitude = 12.5 WHERE location = 'Twin' AND sector = 'A';
DO $$ BEGIN
  ASSERT (SELECT race_point_id IS NULL AND release_latitude = 12.0 FROM public.races WHERE name = 'Race T'), 'a same-named point does not claim unlinked races';
END $$;

-- Public results (home page): rank in the race, race status and Show up verification.
DO $$ DECLARE v record; BEGIN
  SELECT * INTO v FROM public.public_race_results(
    (SELECT id FROM public.clubs LIMIT 1),
    (SELECT ((release_at_utc AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Manila')::date FROM public.races WHERE name = 'Race P'))
  WHERE race_name = 'Race P';
  ASSERT v.rank = 1, 'the only clocked bird of the race is ranked 1';
  ASSERT v.race_status = 'closed', 'race status is shown';
  ASSERT v.verification = 'verified', 'Show up verification is shown';
  ASSERT has_function_privilege('anon', 'public.public_race_results(bigint, date)', 'EXECUTE'), 'visitors (not signed in) can read the public results';
  ASSERT NOT v.disqualified, 'a verified bird is not DQ';
END $$;
-- Public race headers: release point, coordinates, release time and birds clocked / entered.
DO $$ DECLARE v record; BEGIN
  SELECT * INTO v FROM public.public_race_summaries(
    (SELECT id FROM public.clubs LIMIT 1),
    (SELECT ((release_at_utc AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Manila')::date FROM public.races WHERE name = 'Race P'))
  WHERE race_name = 'Race P';
  ASSERT v.release_location = 'Lucena City' AND v.release_latitude = 14.5995 AND v.release_longitude = 120.9842, 'header shows the release point and coordinates';
  ASSERT v.release_at_utc IS NOT NULL AND v.race_status = 'closed', 'header shows release time and status';
  ASSERT v.birds_entered = 1 AND v.birds_clocked = 1, 'header counts birds clocked of entered';
  ASSERT has_function_privilege('anon', 'public.public_race_summaries(bigint, date)', 'EXECUTE'), 'visitors can read the race headers';
END $$;
-- A bird clocked in a closed race that never showed up is listed as DQ, not ranked.
INSERT INTO public.clock_events (race_entry_id, pigeon_ring, received_at_utc, source, verification)
  SELECT id, 'PH-2', now() AT TIME ZONE 'UTC', 'barcode', 'provisional' FROM public.race_entries WHERE barcode = '902';
DO $$ DECLARE v record; BEGIN
  SELECT * INTO v FROM public.public_race_results(
    (SELECT id FROM public.clubs LIMIT 1),
    (SELECT ((release_at_utc AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Manila')::date FROM public.races WHERE name = 'Race L'))
  WHERE race_name = 'Race L';
  ASSERT FOUND, 'the disqualified bird is listed';
  ASSERT v.disqualified AND v.rank IS NULL, 'it is marked DQ and not ranked';
END $$;

-- Show up needed unticked: the same bird counts, ranked, not DQ.
UPDATE public.races SET requires_show_up = false WHERE name = 'Race L';
DO $$ DECLARE v record; BEGIN
  SELECT * INTO v FROM public.public_race_results(
    (SELECT id FROM public.clubs LIMIT 1),
    (SELECT ((release_at_utc AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Manila')::date FROM public.races WHERE name = 'Race L'))
  WHERE race_name = 'Race L';
  ASSERT NOT v.disqualified AND v.rank = 1 AND v.show_up_required = false, 'no show-up needed: ranked, not DQ';
  ASSERT (SELECT requires_show_up FROM public.races WHERE name = 'Race P'), 'races need a show-up by default';
END $$;

-- Clocking videos: a member saves a video only for their own clock, in their folder.
DO $$ DECLARE v_user uuid; v_other uuid; v_clock bigint; v_member bigint; v_club bigint; v_path text; r jsonb; v_failed boolean; BEGIN
  SELECT c.id, e.member_id, rc.club_id INTO v_clock, v_member, v_club
    FROM public.clock_events c JOIN public.race_entries e ON e.id = c.race_entry_id JOIN public.races rc ON rc.id = e.race_id
   WHERE e.barcode = '901';
  INSERT INTO auth.users (email) VALUES ('video-member@users.mayma.invalid') RETURNING id INTO v_user;
  INSERT INTO public.app_profiles (id, role, username, member_id, club_id, is_active) VALUES (v_user, 'member', 'videomember', v_member, v_club, true);
  PERFORM set_config('request.jwt.claim.sub', v_user::text, true);
  v_path := v_club || '/' || v_member || '/' || v_clock || '/1.mp4';
  r := public.member_save_clock_video(v_clock, v_path, 12.5, 4000000);
  ASSERT r->>'status' = 'saved' AND r->>'replaced_path' IS NULL, 'member saves a video: ' || r::text;
  r := public.member_save_clock_video(v_clock, v_club || '/' || v_member || '/' || v_clock || '/2.mp4', 9, 3000000);
  ASSERT r->>'replaced_path' = v_path, 'a new video replaces the old one';
  ASSERT (SELECT count(*) FROM public.clock_videos WHERE clock_event_id = v_clock) = 1, 'one video per clock';
  v_failed := false; BEGIN PERFORM public.member_save_clock_video(v_clock, v_club || '/999/' || v_clock || '/3.mp4', 5, 1000); EXCEPTION WHEN OTHERS THEN v_failed := true; END;
  ASSERT v_failed, 'refused outside the member''s folder';
  v_failed := false; BEGIN PERFORM public.member_save_clock_video(v_clock, v_club || '/' || v_member || '/' || v_clock || '/4.mp4', 45, 1000); EXCEPTION WHEN OTHERS THEN v_failed := true; END;
  ASSERT v_failed, 'refused over 30 seconds';
  -- Another member cannot attach a video to this clock.
  INSERT INTO auth.users (email) VALUES ('video-other@users.mayma.invalid') RETURNING id INTO v_other;
  INSERT INTO public.members (member_no, full_name, loft_name, latitude, longitude, club_id) VALUES ('VID-2', 'Other Member', 'Other Loft', 14, 121, v_club);
  INSERT INTO public.app_profiles (id, role, username, member_id, club_id, is_active) SELECT v_other, 'member', 'videoother', id, v_club, true FROM public.members WHERE member_no = 'VID-2';
  PERFORM set_config('request.jwt.claim.sub', v_other::text, true);
  v_failed := false; BEGIN PERFORM public.member_save_clock_video(v_clock, v_club || '/' || (SELECT id FROM public.members WHERE member_no = 'VID-2') || '/' || v_clock || '/5.mp4', 5, 1000); EXCEPTION WHEN OTHERS THEN v_failed := true; END;
  ASSERT v_failed, 'another member''s clock is refused';
  PERFORM set_config('request.jwt.claim.sub', '', true);
END $$;

-- Forgot password by email.
INSERT INTO auth.users (id, email, encrypted_password) VALUES ('00000000-0000-0000-0000-0000000000a1', 'pw@users.mayma.invalid', extensions.crypt('oldpassword', extensions.gen_salt('bf')));
INSERT INTO public.members (member_no, full_name, loft_name, latitude, longitude, club_id) SELECT 'PW-1', 'Reset member', 'Loft', 13, 121, id FROM public.clubs WHERE name = 'Test club';
INSERT INTO public.app_profiles (id, username, role, member_id, club_id, is_active)
  SELECT '00000000-0000-0000-0000-0000000000a1', 'pwmember', 'member', m.id, m.club_id, true FROM public.members m WHERE m.member_no = 'PW-1';
DO $$
DECLARE v jsonb; v_member bigint := (SELECT id FROM public.members WHERE member_no = 'PW-1'); i int;
BEGIN
  -- No email yet: no reset link; admins cannot mark an email confirmed themselves.
  ASSERT public.password_reset_issue('pwmember') IS NULL, 'no email: no reset link';
  UPDATE public.members SET email = '  Ana@Example.COM ', email_confirmed_at = now() WHERE id = v_member;
  ASSERT (SELECT email = 'ana@example.com' AND email_confirmed_at IS NULL FROM public.members WHERE id = v_member), 'email kept in lower case, not confirmed by an update';
  ASSERT public.password_reset_issue('pwmember') IS NULL, 'unconfirmed email: no reset link';
  -- Confirmation: only the member or the club team may ask; the link confirms once.
  BEGIN PERFORM public.email_confirm_issue(gen_random_uuid(), v_member); RAISE EXCEPTION 'expected: not allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  v := public.email_confirm_issue('00000000-0000-0000-0000-0000000000a1', v_member);
  ASSERT v->>'email' = 'ana@example.com' AND length(v->>'token') = 64, 'confirmation link made';
  ASSERT NOT EXISTS (SELECT 1 FROM public.account_email_tokens WHERE token_hash = v->>'token'), 'links are stored only as hashes';
  PERFORM public.confirm_member_email(v->>'token');
  ASSERT (SELECT email_confirmed_at IS NOT NULL FROM public.members WHERE id = v_member), 'email confirmed';
  BEGIN PERFORM public.confirm_member_email(v->>'token'); RAISE EXCEPTION 'expected: used link';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  -- Reset: case-insensitive username, link works once, sets the password.
  v := public.password_reset_issue('PWMember');
  ASSERT v->>'email' = 'ana@example.com' AND v->>'username' = 'pwmember', 'reset link for the confirmed email';
  BEGIN PERFORM public.password_reset_complete(v->>'token', 'short'); RAISE EXCEPTION 'expected: short password';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  PERFORM public.password_reset_complete(v->>'token', 'newpassword1');
  ASSERT (SELECT encrypted_password = extensions.crypt('newpassword1', encrypted_password) FROM auth.users WHERE id = '00000000-0000-0000-0000-0000000000a1'), 'new password set';
  ASSERT EXISTS (SELECT 1 FROM public.audit_log WHERE table_name = 'password_reset' AND row_id = v_member), 'reset in the change history';
  BEGIN PERFORM public.password_reset_complete(v->>'token', 'another123'); RAISE EXCEPTION 'expected: used link';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  -- A newer link replaces the older one; at most 3 a day.
  v := public.password_reset_issue('pwmember');
  ASSERT public.password_reset_issue('pwmember') IS NOT NULL, 'third link of the day';
  BEGIN PERFORM public.password_reset_complete(v->>'token', 'another123'); RAISE EXCEPTION 'expected: replaced link';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  ASSERT public.password_reset_issue('pwmember') IS NULL, 'no fourth reset email in a day';
  -- Changing the email undoes the confirmation and stops links sent to the old one.
  UPDATE public.account_email_tokens SET created_at = now() - interval '2 days' WHERE member_id = v_member;
  v := public.password_reset_issue('pwmember');
  UPDATE public.members SET email = 'other@example.com' WHERE id = v_member;
  ASSERT (SELECT email_confirmed_at IS NULL FROM public.members WHERE id = v_member), 'changed email must be confirmed again';
  BEGIN PERFORM public.password_reset_complete(v->>'token', 'another123'); RAISE EXCEPTION 'expected: email changed';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  -- Unknown or disabled usernames get nothing.
  ASSERT public.password_reset_issue('nobody') IS NULL, 'unknown username: nothing';
END $$;
-- Visitors and signed-in users cannot make links or read them.
DO $$ BEGIN
  ASSERT NOT has_function_privilege('anon', 'public.password_reset_issue(text)', 'EXECUTE'), 'visitors cannot make reset links';
  ASSERT NOT has_function_privilege('authenticated', 'public.email_confirm_issue(uuid,bigint)', 'EXECUTE'), 'users cannot make confirmation links';
  ASSERT NOT has_table_privilege('authenticated', 'public.account_email_tokens', 'SELECT'), 'links cannot be read';
  ASSERT has_function_privilege('anon', 'public.password_reset_complete(text,text)', 'EXECUTE'), 'visitors can use a reset link';
END $$;

SELECT 'All database checks passed.' AS result;
