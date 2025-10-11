/*
  # Add auth.user profile tracking and tournament validation

  1. New Table
    - `auth_user_profiles` - Track which profile type each auth user has
    - Links auth.users.id to profile tables with profile_type

  2. Functions
    - `get_user_profile_info()` - Get user's profile type and ID
    - `update_auth_user_profile()` - Update profile tracking when users change profiles

  3. Triggers
    - Auto-update auth_user_profiles when profile tables change

  4. Security
    - RLS policies for auth_user_profiles table
    - Enhanced tournament ownership validation
*/

-- Create auth_user_profiles table to track user profile types
CREATE TABLE IF NOT EXISTS auth_user_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL UNIQUE,
  profile_type text NOT NULL CHECK (profile_type IN ('Player', 'Club', 'Organizer', 'Administrator')),
  profile_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE auth_user_profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can read own profile info"
  ON auth_user_profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own profile info"
  ON auth_user_profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "System can insert profile info"
  ON auth_user_profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Function to get user's profile information
CREATE OR REPLACE FUNCTION get_user_profile_info(auth_user_id uuid)
RETURNS TABLE(
  profile_type text,
  profile_id uuid,
  profile_name text
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    aup.profile_type,
    aup.profile_id,
    CASE 
      WHEN aup.profile_type = 'Player' THEN (SELECT pu.full_name FROM player_users pu WHERE pu.id = aup.profile_id)
      WHEN aup.profile_type = 'Club' THEN (SELECT cu.club_name FROM club_users cu WHERE cu.id = aup.profile_id)
      WHEN aup.profile_type = 'Organizer' THEN (SELECT ou.organizer_name FROM organizer_users ou WHERE ou.id = aup.profile_id)
      WHEN aup.profile_type = 'Administrator' THEN (SELECT au.full_name FROM admin_users au WHERE au.id = aup.profile_id)
      ELSE 'Unknown'
    END as profile_name
  FROM auth_user_profiles aup
  WHERE aup.user_id = auth_user_id;
  
  IF NOT FOUND THEN
    RETURN QUERY
    SELECT 'Player'::text, pu.id, pu.full_name
    FROM player_users pu
    WHERE pu.user_id = auth_user_id
    LIMIT 1;
    
    IF FOUND THEN RETURN; END IF;
    
    RETURN QUERY
    SELECT 'Club'::text, cu.id, cu.club_name
    FROM club_users cu
    WHERE cu.user_id = auth_user_id
    LIMIT 1;
    
    IF FOUND THEN RETURN; END IF;
    
    RETURN QUERY
    SELECT 'Organizer'::text, ou.id, ou.organizer_name
    FROM organizer_users ou
    WHERE ou.user_id = auth_user_id
    LIMIT 1;
    
    IF FOUND THEN RETURN; END IF;
    
    RETURN QUERY
    SELECT 'Administrator'::text, au.id, au.full_name
    FROM admin_users au
    WHERE au.user_id = auth_user_id
    LIMIT 1;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to sync auth_user_profiles table
CREATE OR REPLACE FUNCTION sync_auth_user_profile(
  auth_user_id uuid,
  new_profile_type text,
  new_profile_id uuid
)
RETURNS void AS $$
BEGIN
  INSERT INTO auth_user_profiles (user_id, profile_type, profile_id)
  VALUES (auth_user_id, new_profile_type, new_profile_id)
  ON CONFLICT (user_id) 
  DO UPDATE SET 
    profile_type = EXCLUDED.profile_type,
    profile_id = EXCLUDED.profile_id,
    updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check tournament ownership
CREATE OR REPLACE FUNCTION is_tournament_owner(
  tournament_id uuid,
  auth_user_id uuid
)
RETURNS boolean AS $$
DECLARE
  tournament_record RECORD;
  user_profile_record RECORD;
BEGIN
  SELECT organizer_id, hosted_by INTO tournament_record
  FROM tournaments t
  WHERE t.id = tournament_id;
  
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  SELECT profile_type, profile_id INTO user_profile_record
  FROM get_user_profile_info(auth_user_id)
  LIMIT 1;
  
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  IF tournament_record.hosted_by = 'club' AND user_profile_record.profile_type = 'Club' THEN
    RETURN tournament_record.organizer_id = user_profile_record.profile_id;
  ELSIF tournament_record.hosted_by = 'organizer' AND user_profile_record.profile_type = 'Organizer' THEN
    RETURN tournament_record.organizer_id = user_profile_record.profile_id;
  ELSE
    RETURN false;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Triggers to automatically sync auth_user_profiles

CREATE OR REPLACE FUNCTION sync_player_profile()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM sync_auth_user_profile(NEW.user_id, 'Player', NEW.id);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM auth_user_profiles WHERE user_id = OLD.user_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_player_profile_trigger ON player_users;
CREATE TRIGGER sync_player_profile_trigger
  AFTER INSERT OR DELETE ON player_users
  FOR EACH ROW EXECUTE FUNCTION sync_player_profile();

CREATE OR REPLACE FUNCTION sync_club_profile()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM sync_auth_user_profile(NEW.user_id, 'Club', NEW.id);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM auth_user_profiles WHERE user_id = OLD.user_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_club_profile_trigger ON club_users;
CREATE TRIGGER sync_club_profile_trigger
  AFTER INSERT OR DELETE ON club_users
  FOR EACH ROW EXECUTE FUNCTION sync_club_profile();

CREATE OR REPLACE FUNCTION sync_organizer_profile()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM sync_auth_user_profile(NEW.user_id, 'Organizer', NEW.id);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM auth_user_profiles WHERE user_id = OLD.user_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_organizer_profile_trigger ON organizer_users;
CREATE TRIGGER sync_organizer_profile_trigger
  AFTER INSERT OR DELETE ON organizer_users
  FOR EACH ROW EXECUTE FUNCTION sync_organizer_profile();

CREATE OR REPLACE FUNCTION sync_admin_profile()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM sync_auth_user_profile(NEW.user_id, 'Administrator', NEW.id);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM auth_user_profiles WHERE user_id = OLD.user_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_admin_profile_trigger ON admin_users;
CREATE TRIGGER sync_admin_profile_trigger
  AFTER INSERT OR DELETE ON admin_users
  FOR EACH ROW EXECUTE FUNCTION sync_admin_profile();

-- Populate existing data
INSERT INTO auth_user_profiles (user_id, profile_type, profile_id)
SELECT user_id, 'Player', id FROM player_users
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO auth_user_profiles (user_id, profile_type, profile_id)
SELECT user_id, 'Club', id FROM club_users
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO auth_user_profiles (user_id, profile_type, profile_id)
SELECT user_id, 'Organizer', id FROM organizer_users
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO auth_user_profiles (user_id, profile_type, profile_id)
SELECT user_id, 'Administrator', id FROM admin_users
ON CONFLICT (user_id) DO NOTHING;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_auth_user_profiles_user_id ON auth_user_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_user_profiles_profile_type ON auth_user_profiles(profile_type);
CREATE INDEX IF NOT EXISTS idx_auth_user_profiles_profile_id ON auth_user_profiles(profile_id);