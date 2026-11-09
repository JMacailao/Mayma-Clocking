-- Add an open/end date range to race schedules.
-- Existing schedules remain valid with NULL dates; new schedules collect both dates.
ALTER TABLE public.races
  ADD COLUMN IF NOT EXISTS open_date date,
  ADD COLUMN IF NOT EXISTS end_date date;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.races'::regclass
      AND conname = 'races_date_range_valid'
  ) THEN
    ALTER TABLE public.races
      ADD CONSTRAINT races_date_range_valid
      CHECK (
        (open_date IS NULL AND end_date IS NULL)
        OR (open_date IS NOT NULL AND end_date IS NOT NULL AND end_date >= open_date)
      );
  END IF;
END $$;
