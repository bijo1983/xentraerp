/*
  # Complete User Removal Migration
  
  This migration completely removes a user from both:
  1. All profile tables (player_users, club_users, organizer_users, admin_users)
  2. The auth.users table (authentication account)
  
  WARNING: This is irreversible - the user will lose access to their account completely.
*/

-- Function to completely remove a user from the system
CREATE OR REPLACE FUNCTION completely_remove_user(user_email text)
RETURNS text AS $$
DECLARE
  auth_user_id uuid;
  player_count int := 0;
  booking_count int := 0;
  tournament_count int := 0;
  club_count int := 0;
  organizer_count int := 0;
  admin_count int := 0;
  auth_count int := 0;
  user_name text;
BEGIN
  -- Get the auth user ID
  SELECT id INTO auth_user_id 
  FROM auth.users 
  WHERE email = user_email;
  
  IF auth_user_id IS NULL THEN
    RETURN format('No user found with email: %s', user_email);
  END IF;
  
  -- Get user name for logging (try all profile tables)
  SELECT full_name INTO user_name FROM player_users WHERE user_id = auth_user_id;
  IF user_name IS NULL THEN
    SELECT club_name INTO user_name FROM club_users WHERE user_id = auth_user_id;
  END IF;
  IF user_name IS NULL THEN
    SELECT organizer_name INTO user_name FROM organizer_users WHERE user_id = auth_user_id;
  END IF;
  IF user_name IS NULL THEN
    SELECT full_name INTO user_name FROM admin_users WHERE user_id = auth_user_id;
  END IF;
  
  -- Clean up related data first (to maintain referential integrity)
  
  -- Remove bookings (if user is a player)
  DELETE FROM bookings 
  WHERE player_id IN (SELECT id FROM player_users WHERE user_id = auth_user_id);
  GET DIAGNOSTICS booking_count = ROW_COUNT;
  
  -- Remove tournament participations (if user is a player)
  DELETE FROM tournament_participants 
  WHERE player_id IN (SELECT id FROM player_users WHERE user_id = auth_user_id);
  GET DIAGNOSTICS tournament_count = ROW_COUNT;
  
  -- Remove court slots for courts owned by this club (if user is a club)
  DELETE FROM court_slots 
  WHERE court_id IN (
    SELECT c.id FROM courts c 
    JOIN club_users cu ON c.club_id = cu.id 
    WHERE cu.user_id = auth_user_id
  );
  
  -- Remove courts owned by this club (if user is a club)
  DELETE FROM courts 
  WHERE club_id IN (SELECT id FROM club_users WHERE user_id = auth_user_id);
  
  -- Remove tournaments organized by this user (if user is club/organizer)
  DELETE FROM tournaments 
  WHERE (hosted_by = 'club' AND organizer_id IN (SELECT id FROM club_users WHERE user_id = auth_user_id))
     OR (hosted_by = 'organizer' AND organizer_id IN (SELECT id FROM organizer_users WHERE user_id = auth_user_id));
  
  -- Remove from all profile tables
  DELETE FROM player_users WHERE user_id = auth_user_id;
  GET DIAGNOSTICS player_count = ROW_COUNT;
  
  DELETE FROM club_users WHERE user_id = auth_user_id;
  GET DIAGNOSTICS club_count = ROW_COUNT;
  
  DELETE FROM organizer_users WHERE user_id = auth_user_id;
  GET DIAGNOSTICS organizer_count = ROW_COUNT;
  
  DELETE FROM admin_users WHERE user_id = auth_user_id;
  GET DIAGNOSTICS admin_count = ROW_COUNT;
  
  -- Finally, remove from auth.users table
  DELETE FROM auth.users WHERE id = auth_user_id;
  GET DIAGNOSTICS auth_count = ROW_COUNT;
  
  RETURN format(
    'Successfully removed user %s (%s): Auth=%s, Player=%s, Club=%s, Organizer=%s, Admin=%s, Bookings=%s, Tournaments=%s',
    user_email,
    COALESCE(user_name, 'Unknown'),
    auth_count,
    player_count,
    club_count,
    organizer_count,
    admin_count,
    booking_count,
    tournament_count
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN format('Error removing user %s: %s', user_email, SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Execute the function to completely remove the specific user
SELECT completely_remove_user('bijo_101@yahoo.co.in');

-- Drop the function after use (cleanup)
DROP FUNCTION IF EXISTS completely_remove_user(text);