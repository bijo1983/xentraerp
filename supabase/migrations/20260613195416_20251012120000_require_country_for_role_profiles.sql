/*
  # Require country_id for role profiles

  - Enforces NOT NULL on country_id for player, club, and organizer users
  - Only applies if no NULL values exist (tables are empty on fresh setup)
*/

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM player_users WHERE country_id IS NULL) THEN
    RAISE NOTICE 'player_users.country_id contains NULL values - skipping NOT NULL constraint';
  ELSE
    ALTER TABLE player_users ALTER COLUMN country_id SET NOT NULL;
  END IF;
  
  IF EXISTS (SELECT 1 FROM club_users WHERE country_id IS NULL) THEN
    RAISE NOTICE 'club_users.country_id contains NULL values - skipping NOT NULL constraint';
  ELSE
    ALTER TABLE club_users ALTER COLUMN country_id SET NOT NULL;
  END IF;
  
  IF EXISTS (SELECT 1 FROM organizer_users WHERE country_id IS NULL) THEN
    RAISE NOTICE 'organizer_users.country_id contains NULL values - skipping NOT NULL constraint';
  ELSE
    ALTER TABLE organizer_users ALTER COLUMN country_id SET NOT NULL;
  END IF;
END
$$;
