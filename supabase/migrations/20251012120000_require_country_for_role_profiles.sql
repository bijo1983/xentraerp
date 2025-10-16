-- Enforce mandatory country selection for player, club, and organizer profiles
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM player_users WHERE country_id IS NULL) THEN
    RAISE EXCEPTION 'player_users.country_id contains NULL values. Please backfill before applying constraint.';
  END IF;
  IF EXISTS (SELECT 1 FROM club_users WHERE country_id IS NULL) THEN
    RAISE EXCEPTION 'club_users.country_id contains NULL values. Please backfill before applying constraint.';
  END IF;
  IF EXISTS (SELECT 1 FROM organizer_users WHERE country_id IS NULL) THEN
    RAISE EXCEPTION 'organizer_users.country_id contains NULL values. Please backfill before applying constraint.';
  END IF;
END
$$;

ALTER TABLE player_users
  ALTER COLUMN country_id SET NOT NULL;

ALTER TABLE club_users
  ALTER COLUMN country_id SET NOT NULL;

ALTER TABLE organizer_users
  ALTER COLUMN country_id SET NOT NULL;
