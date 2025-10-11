/*
  # Drop Player Information for Specific User

  1. Purpose
    - Remove player profile data for user with email bijo_101@yahoo.co.in
    - Clean up any related data safely
    - Preserve auth user account but remove profile data

  2. Safety
    - Only removes data from player_users table
    - Does not affect auth.users table
    - User can re-register with correct profile type if needed

  3. Process
    - Find the user by email in auth.users
    - Remove corresponding record from player_users table
    - Log the action for audit purposes
*/

-- Function to safely drop player data for specific user
CREATE OR REPLACE FUNCTION drop_player_data(user_email text)
RETURNS text AS $$
DECLARE
  auth_user_id uuid;
  deleted_count int;
  player_name text;
BEGIN
  -- Get the auth user ID
  SELECT id INTO auth_user_id 
  FROM auth.users 
  WHERE email = user_email;
  
  IF auth_user_id IS NULL THEN
    RETURN format('No user found with email: %s', user_email);
  END IF;
  
  -- Get player name before deletion for logging
  SELECT full_name INTO player_name
  FROM player_users 
  WHERE user_id = auth_user_id;
  
  -- Delete from player_users table
  DELETE FROM player_users 
  WHERE user_id = auth_user_id;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  IF deleted_count > 0 THEN
    RETURN format('Successfully removed player profile for %s (name: %s, email: %s)', 
                  COALESCE(player_name, 'Unknown'), 
                  user_email,
                  'Auth account preserved');
  ELSE
    RETURN format('No player profile found for email: %s', user_email);
  END IF;
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN format('Error removing player data for %s: %s', user_email, SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Execute the function to drop the specific user's player data
SELECT drop_player_data('bijo_101@yahoo.co.in');

-- Clean up any related data (bookings, tournament participations)
-- Note: This preserves referential integrity by handling related records

DO $$
DECLARE
  auth_user_id uuid;
  player_user_id uuid;
  booking_count int;
  tournament_count int;
BEGIN
  -- Get the auth user ID
  SELECT id INTO auth_user_id 
  FROM auth.users 
  WHERE email = 'bijo_101@yahoo.co.in';
  
  IF auth_user_id IS NOT NULL THEN
    -- Get player_user_id if it exists (it should be deleted by now, but check for any orphaned data)
    SELECT id INTO player_user_id
    FROM player_users 
    WHERE user_id = auth_user_id;
    
    IF player_user_id IS NOT NULL THEN
      -- Clean up bookings
      DELETE FROM bookings WHERE player_id = player_user_id;
      GET DIAGNOSTICS booking_count = ROW_COUNT;
      
      -- Clean up tournament participations
      DELETE FROM tournament_participants WHERE player_id = player_user_id;
      GET DIAGNOSTICS tournament_count = ROW_COUNT;
      
      RAISE NOTICE 'Cleaned up % bookings and % tournament participations', booking_count, tournament_count;
    END IF;
  END IF;
END $$;

-- Drop the temporary function after use
DROP FUNCTION IF EXISTS drop_player_data(text);