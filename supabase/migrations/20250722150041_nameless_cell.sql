/*
  # Update Tournament Organizer IDs

  This migration fixes existing tournaments by updating their organizer_id field
  to use the correct Supabase auth user ID instead of profile table IDs.

  1. Updates tournaments hosted by clubs
     - Matches tournament organizer_id with club_users.id
     - Updates to use club_users.user_id (auth user ID)

  2. Updates tournaments hosted by organizers  
     - Matches tournament organizer_id with organizer_users.id
     - Updates to use organizer_users.user_id (auth user ID)

  3. Provides verification of changes made
*/

-- Update tournaments hosted by clubs
UPDATE tournaments 
SET organizer_id = club_users.user_id
FROM club_users 
WHERE tournaments.hosted_by = 'club' 
  AND tournaments.organizer_id = club_users.id;

-- Update tournaments hosted by organizers
UPDATE tournaments 
SET organizer_id = organizer_users.user_id
FROM organizer_users 
WHERE tournaments.hosted_by = 'organizer' 
  AND tournaments.organizer_id = organizer_users.id;

-- Verification: Show updated tournaments
DO $$
DECLARE
    club_count INTEGER;
    organizer_count INTEGER;
    total_count INTEGER;
BEGIN
    -- Count club tournaments updated
    SELECT COUNT(*) INTO club_count
    FROM tournaments t
    JOIN club_users c ON t.organizer_id = c.user_id
    WHERE t.hosted_by = 'club';
    
    -- Count organizer tournaments updated  
    SELECT COUNT(*) INTO organizer_count
    FROM tournaments t
    JOIN organizer_users o ON t.organizer_id = o.user_id
    WHERE t.hosted_by = 'organizer';
    
    -- Total tournaments
    SELECT COUNT(*) INTO total_count FROM tournaments;
    
    RAISE NOTICE 'Tournament organizer_id update completed:';
    RAISE NOTICE '- Club tournaments with correct organizer_id: %', club_count;
    RAISE NOTICE '- Organizer tournaments with correct organizer_id: %', organizer_count;
    RAISE NOTICE '- Total tournaments in database: %', total_count;
END $$;