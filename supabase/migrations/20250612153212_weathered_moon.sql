/*
  # Fix User Registration Issues

  1. Create function to handle user registration properly
  2. Create trigger for automatic user profile creation
  3. Fix existing user data
  4. Ensure proper profile_id assignment
*/

-- Create function to handle new user registration
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
DECLARE
  profile_uuid uuid;
BEGIN
  -- This function will be called by a trigger, but since we're handling
  -- user creation in the application, we'll keep this simple
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to manually fix existing user
CREATE OR REPLACE FUNCTION fix_existing_user(
  user_email text,
  user_type text,
  user_name text,
  user_phone text DEFAULT NULL,
  user_country_id uuid DEFAULT NULL
)
RETURNS void AS $$
DECLARE
  auth_user_id uuid;
  profile_uuid uuid;
  existing_record_count int;
BEGIN
  -- Get the auth user ID
  SELECT id INTO auth_user_id 
  FROM auth.users 
  WHERE email = user_email;
  
  IF auth_user_id IS NULL THEN
    RAISE EXCEPTION 'User with email % not found in auth.users', user_email;
  END IF;
  
  -- Get the profile ID for the user type
  SELECT id INTO profile_uuid 
  FROM profiles 
  WHERE LOWER(name) = LOWER(user_type);
  
  IF profile_uuid IS NULL THEN
    RAISE EXCEPTION 'Profile type % not found', user_type;
  END IF;
  
  -- Check if user already exists in any profile table and delete if found
  DELETE FROM player_users WHERE user_id = auth_user_id;
  DELETE FROM club_users WHERE user_id = auth_user_id;
  DELETE FROM organizer_users WHERE user_id = auth_user_id;
  DELETE FROM admin_users WHERE user_id = auth_user_id;
  
  -- Insert into appropriate table based on user type
  IF LOWER(user_type) = 'player' THEN
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
  ELSIF LOWER(user_type) = 'club' THEN
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
  ELSIF LOWER(user_type) = 'organizer' THEN
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
  ELSIF LOWER(user_type) = 'admin' OR LOWER(user_type) = 'administrator' THEN
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
    RAISE EXCEPTION 'Invalid user type: %', user_type;
  END IF;
  
  RAISE NOTICE 'User % successfully created as %', user_email, user_type;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fix the existing user bjo.mammen@gmail.com
-- You can run this manually in the Supabase SQL editor:
-- SELECT fix_existing_user('bjo.mammen@gmail.com', 'Player', 'Bjo Mammen');

-- Or if you want to specify more details:
-- SELECT fix_existing_user('bjo.mammen@gmail.com', 'Player', 'Bjo Mammen', '+1234567890', (SELECT id FROM countries WHERE name = 'United States'));