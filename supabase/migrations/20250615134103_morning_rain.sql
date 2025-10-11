/*
  # Delete specific user from auth.users

  1. Purpose
    - Remove user bjo.mammen@gmail.com from auth.users table
    - Clean up any related profile data safely
    - Maintain referential integrity

  2. Safety
    - Removes related data from profile tables first
    - Then removes from auth.users table
    - Logs the action for audit purposes

  3. Process
    - Find the user by email in auth.users
    - Remove corresponding records from all profile tables
    - Remove from auth.users table
    - Log the action
*/

-- Function to safely delete user and all related data
CREATE OR REPLACE FUNCTION delete_user_completely(user_email text)
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
  court_count int := 0;
  slot_count int := 0;
  match_count int := 0;
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
  
  -- Remove tournament matches for tournaments organized by this user
  DELETE FROM tournament_matches 
  WHERE tournament_id IN (
    SELECT t.id FROM tournaments t 
    WHERE (t.hosted_by = 'club' AND t.organizer_id IN (SELECT id FROM club_users WHERE user_id = auth_user_id))
       OR (t.hosted_by = 'organizer' AND t.organizer_id IN (SELECT id FROM organizer_users WHERE user_id = auth_user_id))
  );
  GET DIAGNOSTICS match_count = ROW_COUNT;
  
  -- Remove tournament participations (if user is a player)
  DELETE FROM tournament_participants 
  WHERE player_id IN (SELECT id FROM player_users WHERE user_id = auth_user_id);
  GET DIAGNOSTICS tournament_count = ROW_COUNT;
  
  -- Remove tournaments organized by this user (if user is club/organizer)
  DELETE FROM tournaments 
  WHERE (hosted_by = 'club' AND organizer_id IN (SELECT id FROM club_users WHERE user_id = auth_user_id))
     OR (hosted_by = 'organizer' AND organizer_id IN (SELECT id FROM organizer_users WHERE user_id = auth_user_id));
  
  -- Remove bookings (if user is a player)
  DELETE FROM bookings 
  WHERE player_id IN (SELECT id FROM player_users WHERE user_id = auth_user_id);
  GET DIAGNOSTICS booking_count = ROW_COUNT;
  
  -- Remove court slots for courts owned by this club (if user is a club)
  DELETE FROM court_slots 
  WHERE court_id IN (
    SELECT c.id FROM courts c 
    JOIN club_users cu ON c.club_id = cu.id 
    WHERE cu.user_id = auth_user_id
  );
  GET DIAGNOSTICS slot_count = ROW_COUNT;
  
  -- Remove courts owned by this club (if user is a club)
  DELETE FROM courts 
  WHERE club_id IN (SELECT id FROM club_users WHERE user_id = auth_user_id);
  GET DIAGNOSTICS court_count = ROW_COUNT;
  
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
    'Successfully deleted user %s (%s): Auth=%s, Player=%s, Club=%s, Organizer=%s, Admin=%s, Bookings=%s, Tournaments=%s, Courts=%s, Slots=%s, Matches=%s',
    user_email,
    COALESCE(user_name, 'Unknown'),
    auth_count,
    player_count,
    club_count,
    organizer_count,
    admin_count,
    booking_count,
    tournament_count,
    court_count,
    slot_count,
    match_count
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN format('Error deleting user %s: %s', user_email, SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Execute the function to delete the specific user
SELECT delete_user_completely('bjo.mammen@gmail.com');

-- Drop the function after use (cleanup)
DROP FUNCTION IF EXISTS delete_user_completely(text);