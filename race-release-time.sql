-- Allow race schedules to be created before the release date and time is known.
-- A race still needs a release date and time before it can be opened for clocking.
ALTER TABLE public.races
  ALTER COLUMN release_at_utc DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.races'::regclass
      AND conname = 'races_open_requires_release_time'
  ) THEN
    ALTER TABLE public.races
      ADD CONSTRAINT races_open_requires_release_time
      CHECK (status <> 'open' OR release_at_utc IS NOT NULL);
  END IF;
END $$;
