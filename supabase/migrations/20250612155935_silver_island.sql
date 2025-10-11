-- Function to fix existing user profile type
CREATE OR REPLACE FUNCTION fix_user_profile_type(
  user_email text,
  correct_user_type text,
  user_name text,
  user_phone text DEFAULT NULL,
  user_country_id uuid DEFAULT NULL
)
RETURNS void AS $$
DECLARE
  auth_user_id uuid;
  profile_uuid uuid;
BEGIN
  -- Get the auth user ID
  SELECT id INTO auth_user_id 
  FROM auth.users 
  WHERE email = user_email;
  
  IF auth_user_id IS NULL THEN
    RAISE EXCEPTION 'User with email % not found in auth.users', user_email;
  END IF;
  
  -- Get the profile ID for the correct user type
  SELECT id INTO profile_uuid 
  FROM profiles 
  WHERE LOWER(name) = LOWER(correct_user_type);
  
  IF profile_uuid IS NULL THEN
    RAISE EXCEPTION 'Profile type % not found', correct_user_type;
  END IF;
  
  -- Remove user from all profile tables first
  DELETE FROM player_users WHERE user_id = auth_user_id;
  DELETE FROM club_users WHERE user_id = auth_user_id;
  DELETE FROM organizer_users WHERE user_id = auth_user_id;
  DELETE FROM admin_users WHERE user_id = auth_user_id;
  
  -- Insert into correct table based on user type
  IF LOWER(correct_user_type) = 'player' THEN
    INSERT INTO player_users (
      user_id, 
      full_name, 
      email, 
      phone_number, 
      country_id, 
      profile_id,
      skill_level
    ) VALUES (
      auth_user_id, 
      user_name, 
      user_email, 
      user_phone, 
      user_country_id, 
      profile_uuid,
      'Beginner'
    );
  ELSIF LOWER(correct_user_type) = 'club' THEN
    INSERT INTO club_users (
      user_id, 
      club_name, 
      email, 
      phone_number, 
      country_id, 
      profile_id
    ) VALUES (
      auth_user_id, 
      user_name, 
      user_email, 
      user_phone, 
      user_country_id, 
      profile_uuid
    );
  ELSIF LOWER(correct_user_type) = 'organizer' THEN
    INSERT INTO organizer_users (
      user_id, 
      organizer_name, 
      email, 
      phone_number, 
      country_id, 
      profile_id
    ) VALUES (
      auth_user_id, 
      user_name, 
      user_email, 
      user_phone, 
      user_country_id, 
      profile_uuid
    );
  ELSIF LOWER(correct_user_type) = 'admin' OR LOWER(correct_user_type) = 'administrator' THEN
    INSERT INTO admin_users (
      user_id, 
      full_name, 
      email, 
      profile_id
    ) VALUES (
      auth_user_id, 
      user_name, 
      user_email, 
      profile_uuid
    );
  ELSE
    RAISE EXCEPTION 'Invalid user type: %', correct_user_type;
  END IF;
  
  RAISE NOTICE 'User % profile corrected to %', user_email, correct_user_type;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fix the specific user "edu sports" - assuming this is the club name
-- You'll need to run this with the actual email address
-- Example: SELECT fix_user_profile_type('your-email@example.com', 'Club', 'edu sports');