/*
  # Fix User Profile Types and Add Organizer Support

  1. Enhanced Functions
    - `fix_user_profile_type()` - Main function to correct user profiles
    - `fix_organizer_profile()` - Specific function for organizer profiles  
    - `fix_club_profile()` - Specific function for club profiles

  2. Profile Management
    - Handles all user types (Player, Club, Organizer, Admin)
    - Properly moves users between profile tables
    - Validates profile types and provides clear error messages

  3. Usage Examples
    - Functions to easily fix incorrectly assigned user profiles
    - Support for optional parameters like country, phone, etc.
*/

-- Enhanced function to fix user profile type with better organizer support
CREATE OR REPLACE FUNCTION fix_user_profile_type(
  user_email text,
  correct_user_type text,
  user_name text,
  user_phone text DEFAULT NULL,
  user_country_id uuid DEFAULT NULL,
  company_name text DEFAULT NULL,
  website text DEFAULT NULL,
  address text DEFAULT NULL
)
RETURNS text AS $$
DECLARE
  auth_user_id uuid;
  profile_uuid uuid;
  result_message text;
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
    RAISE EXCEPTION 'Profile type % not found. Available types: Player, Club, Organizer, Administrator', correct_user_type;
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
    result_message := 'Player profile created successfully';
    
  ELSIF LOWER(correct_user_type) = 'club' THEN
    INSERT INTO club_users (
      user_id, 
      club_name, 
      email, 
      phone_number, 
      country_id, 
      profile_id,
      address,
      website
    ) VALUES (
      auth_user_id, 
      user_name, 
      user_email, 
      user_phone, 
      user_country_id, 
      profile_uuid,
      address,
      website
    );
    result_message := 'Club profile created successfully';
    
  ELSIF LOWER(correct_user_type) = 'organizer' THEN
    INSERT INTO organizer_users (
      user_id, 
      organizer_name, 
      email, 
      phone_number, 
      country_id, 
      profile_id,
      company_name,
      website
    ) VALUES (
      auth_user_id, 
      user_name, 
      user_email, 
      user_phone, 
      user_country_id, 
      profile_uuid,
      company_name,
      website
    );
    result_message := 'Organizer profile created successfully';
    
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
    result_message := 'Admin profile created successfully';
    
  ELSE
    RAISE EXCEPTION 'Invalid user type: %. Valid types are: Player, Club, Organizer, Administrator', correct_user_type;
  END IF;
  
  RETURN format('User %s profile corrected to %s. %s', user_email, correct_user_type, result_message);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function specifically for fixing organizer profiles
CREATE OR REPLACE FUNCTION fix_organizer_profile(
  user_email text,
  organizer_name text,
  company_name text DEFAULT NULL,
  website text DEFAULT NULL,
  phone text DEFAULT NULL,
  country_name text DEFAULT NULL
)
RETURNS text AS $$
DECLARE
  country_uuid uuid;
BEGIN
  -- Get country ID if country name is provided
  IF country_name IS NOT NULL THEN
    SELECT id INTO country_uuid 
    FROM countries 
    WHERE LOWER(name) = LOWER(country_name);
    
    IF country_uuid IS NULL THEN
      RAISE NOTICE 'Country % not found, proceeding without country', country_name;
    END IF;
  END IF;
  
  -- Call the main fix function
  RETURN fix_user_profile_type(
    user_email,
    'Organizer',
    organizer_name,
    phone,
    country_uuid,
    company_name,
    website
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function specifically for fixing club profiles
CREATE OR REPLACE FUNCTION fix_club_profile(
  user_email text,
  club_name text,
  address text DEFAULT NULL,
  website text DEFAULT NULL,
  phone text DEFAULT NULL,
  country_name text DEFAULT NULL
)
RETURNS text AS $$
DECLARE
  country_uuid uuid;
BEGIN
  -- Get country ID if country name is provided
  IF country_name IS NOT NULL THEN
    SELECT id INTO country_uuid 
    FROM countries 
    WHERE LOWER(name) = LOWER(country_name);
    
    IF country_uuid IS NULL THEN
      RAISE NOTICE 'Country % not found, proceeding without country', country_name;
    END IF;
  END IF;
  
  -- Call the main fix function
  RETURN fix_user_profile_type(
    user_email,
    'Club',
    club_name,
    phone,
    country_uuid,
    NULL, -- company_name (not used for clubs)
    website,
    address
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Examples of how to use these functions:

-- For fixing a club profile:
-- SELECT fix_club_profile('club-email@example.com', 'Club Name', '123 Main St', 'https://club.com', '+1234567890', 'United States');

-- For fixing an organizer profile:
-- SELECT fix_organizer_profile('organizer-email@example.com', 'Organizer Name', 'Company Name', 'https://company.com', '+1234567890', 'United States');

-- For fixing any profile type with full control:
-- SELECT fix_user_profile_type('user-email@example.com', 'Organizer', 'Name', '+1234567890', (SELECT id FROM countries WHERE name = 'United States'), 'Company', 'https://website.com');