/*
  NOTE: Refresh this file by running `npm run supabase:pull` with
  SUPABASE_URL and SUPABASE_ANON_KEY configured. The fetch script pulls the
  live schema, policies, and functions from the remote Supabase instance.

  # Badminton Platform Database Schema & Activity Feed Helper

  1. Core Schema Objects
    - Creates reference and domain tables that power the booking platform
    - Ensures tables, indexes, and relations exist with idempotent guards

  2. Security & Policies
    - Enables Row Level Security for every business table
    - Recreates access policies that govern Supabase auth roles

  3. Helper Functions
    - `get_recent_database_changes` - Consolidates booking, tournament, court, and profile updates
*/

-- =========================
-- Core Schema (Idempotent)
-- =========================

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now()
);

INSERT INTO profiles (name, description) VALUES
  ('Administrator', 'Platform administrator with full access'),
  ('Player', 'Individual player who can book courts and join tournaments'),
  ('Club', 'Club that manages courts and can host tournaments'),
  ('Organizer', 'Event organizer who can rent courts and run tournaments')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS countries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  code text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now()
);

INSERT INTO countries (name, code) VALUES
  ('United States', 'US'),
  ('United Kingdom', 'UK'),
  ('Canada', 'CA'),
  ('Australia', 'AU'),
  ('Singapore', 'SG'),
  ('Malaysia', 'MY'),
  ('Indonesia', 'ID'),
  ('Thailand', 'TH'),
  ('Philippines', 'PH'),
  ('India', 'IN')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS player_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  full_name text NOT NULL,
  email text NOT NULL,
  phone_number text,
  country_id uuid REFERENCES countries,
  profile_id uuid REFERENCES profiles NOT NULL,
  skill_level text DEFAULT 'Beginner',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS club_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  club_name text NOT NULL,
  email text NOT NULL,
  phone_number text,
  country_id uuid REFERENCES countries,
  profile_id uuid REFERENCES profiles NOT NULL,
  address text,
  website text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organizer_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  organizer_name text NOT NULL,
  email text NOT NULL,
  phone_number text,
  country_id uuid REFERENCES countries,
  profile_id uuid REFERENCES profiles NOT NULL,
  company_name text,
  website text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  full_name text NOT NULL,
  email text NOT NULL,
  profile_id uuid REFERENCES profiles NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS courts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid REFERENCES club_users NOT NULL,
  name text NOT NULL,
  location text,
  surface_type text DEFAULT 'Synthetic',
  hourly_rate numeric(10,2) DEFAULT 0,
  is_available boolean DEFAULT true,
  amenities text[],
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS court_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  court_id uuid REFERENCES courts NOT NULL,
  date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  is_booked boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid REFERENCES player_users NOT NULL,
  slot_id uuid REFERENCES court_slots NOT NULL,
  booking_date timestamptz DEFAULT now(),
  status text DEFAULT 'booked' CHECK (status IN ('booked', 'cancelled', 'completed')),
  payment_status text DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'refunded')),
  total_amount numeric(10,2),
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tournaments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  organizer_id uuid NOT NULL,
  hosted_by text NOT NULL CHECK (hosted_by IN ('club', 'organizer')),
  location text,
  description text,
  start_date date NOT NULL,
  end_date date NOT NULL,
  registration_deadline date,
  max_participants integer DEFAULT 32,
  entry_fee numeric(10,2) DEFAULT 0,
  prize_pool numeric(10,2) DEFAULT 0,
  status text DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'registration_open', 'ongoing', 'completed', 'cancelled')),
  tournament_format text DEFAULT 'single_elimination',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tournament_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid REFERENCES tournaments NOT NULL,
  player_id uuid REFERENCES player_users NOT NULL,
  registered_on timestamptz DEFAULT now(),
  payment_status text DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid')),
  UNIQUE(tournament_id, player_id)
);

CREATE TABLE IF NOT EXISTS tournament_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid REFERENCES tournaments NOT NULL,
  round_number integer NOT NULL DEFAULT 1,
  match_number integer NOT NULL,
  player_1_id uuid REFERENCES player_users,
  player_2_id uuid REFERENCES player_users,
  scheduled_on timestamptz,
  court_id uuid REFERENCES courts,
  winner_id uuid REFERENCES player_users,
  player_1_score integer DEFAULT 0,
  player_2_score integer DEFAULT 0,
  match_status text DEFAULT 'scheduled' CHECK (match_status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- =========================
-- Indexes
-- =========================
CREATE INDEX IF NOT EXISTS idx_player_users_user_id ON player_users(user_id);
CREATE INDEX IF NOT EXISTS idx_club_users_user_id ON club_users(user_id);
CREATE INDEX IF NOT EXISTS idx_organizer_users_user_id ON organizer_users(user_id);
CREATE INDEX IF NOT EXISTS idx_courts_club_id ON courts(club_id);
CREATE INDEX IF NOT EXISTS idx_court_slots_court_id ON court_slots(court_id);
CREATE INDEX IF NOT EXISTS idx_court_slots_date ON court_slots(date);
CREATE INDEX IF NOT EXISTS idx_bookings_player_id ON bookings(player_id);
CREATE INDEX IF NOT EXISTS idx_bookings_slot_id ON bookings(slot_id);
CREATE INDEX IF NOT EXISTS idx_tournaments_organizer_id ON tournaments(organizer_id);
CREATE INDEX IF NOT EXISTS idx_tournament_participants_tournament_id ON tournament_participants(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_participants_player_id ON tournament_participants(player_id);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_tournament_id ON tournament_matches(tournament_id);

-- =========================
-- Row Level Security Enablement
-- =========================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE club_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizer_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE courts ENABLE ROW LEVEL SECURITY;
ALTER TABLE court_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_matches ENABLE ROW LEVEL SECURITY;

-- =========================
-- Row Level Security Policies
-- =========================
DROP POLICY IF EXISTS "Profiles are publicly readable" ON profiles;
CREATE POLICY "Profiles are publicly readable"
  ON profiles FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Countries are publicly readable" ON countries;
CREATE POLICY "Countries are publicly readable"
  ON countries FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Players can read own data" ON player_users;
CREATE POLICY "Players can read own data"
  ON player_users FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Players can update own data" ON player_users;
CREATE POLICY "Players can update own data"
  ON player_users FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Anyone can create player profile" ON player_users;
CREATE POLICY "Anyone can create player profile"
  ON player_users FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Clubs can read own data" ON club_users;
CREATE POLICY "Clubs can read own data"
  ON club_users FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Clubs can update own data" ON club_users;
CREATE POLICY "Clubs can update own data"
  ON club_users FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Anyone can create club profile" ON club_users;
CREATE POLICY "Anyone can create club profile"
  ON club_users FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Organizers can read own data" ON organizer_users;
CREATE POLICY "Organizers can read own data"
  ON organizer_users FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Organizers can update own data" ON organizer_users;
CREATE POLICY "Organizers can update own data"
  ON organizer_users FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Anyone can create organizer profile" ON organizer_users;
CREATE POLICY "Anyone can create organizer profile"
  ON organizer_users FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Anyone can view courts" ON courts;
CREATE POLICY "Anyone can view courts"
  ON courts FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Clubs can manage own courts" ON courts;
CREATE POLICY "Clubs can manage own courts"
  ON courts FOR ALL
  TO authenticated
  USING (club_id IN (SELECT id FROM club_users WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Anyone can view court slots" ON court_slots;
CREATE POLICY "Anyone can view court slots"
  ON court_slots FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Clubs can manage slots for own courts" ON court_slots;
CREATE POLICY "Clubs can manage slots for own courts"
  ON court_slots FOR ALL
  TO authenticated
  USING (court_id IN (SELECT id FROM courts WHERE club_id IN (SELECT id FROM club_users WHERE user_id = auth.uid())));

DROP POLICY IF EXISTS "Players can view own bookings" ON bookings;
CREATE POLICY "Players can view own bookings"
  ON bookings FOR SELECT
  TO authenticated
  USING (player_id IN (SELECT id FROM player_users WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Players can create bookings" ON bookings;
CREATE POLICY "Players can create bookings"
  ON bookings FOR INSERT
  TO authenticated
  WITH CHECK (player_id IN (SELECT id FROM player_users WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Players can update own bookings" ON bookings;
CREATE POLICY "Players can update own bookings"
  ON bookings FOR UPDATE
  TO authenticated
  USING (player_id IN (SELECT id FROM player_users WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Anyone can view tournaments" ON tournaments;
CREATE POLICY "Anyone can view tournaments"
  ON tournaments FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Clubs and organizers can create tournaments" ON tournaments;
CREATE POLICY "Clubs and organizers can create tournaments"
  ON tournaments FOR INSERT
  TO authenticated
  WITH CHECK (
    (hosted_by = 'club' AND organizer_id IN (SELECT id FROM club_users WHERE user_id = auth.uid())) OR
    (hosted_by = 'organizer' AND organizer_id IN (SELECT id FROM organizer_users WHERE user_id = auth.uid()))
  );

DROP POLICY IF EXISTS "Tournament hosts can update their tournaments" ON tournaments;
CREATE POLICY "Tournament hosts can update their tournaments"
  ON tournaments FOR UPDATE
  TO authenticated
  USING (
    (hosted_by = 'club' AND organizer_id IN (SELECT id FROM club_users WHERE user_id = auth.uid())) OR
    (hosted_by = 'organizer' AND organizer_id IN (SELECT id FROM organizer_users WHERE user_id = auth.uid()))
  );

DROP POLICY IF EXISTS "Anyone can view tournament participants" ON tournament_participants;
CREATE POLICY "Anyone can view tournament participants"
  ON tournament_participants FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Players can register for tournaments" ON tournament_participants;
CREATE POLICY "Players can register for tournaments"
  ON tournament_participants FOR INSERT
  TO authenticated
  WITH CHECK (player_id IN (SELECT id FROM player_users WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Anyone can view tournament matches" ON tournament_matches;
CREATE POLICY "Anyone can view tournament matches"
  ON tournament_matches FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Tournament hosts can manage matches" ON tournament_matches;
CREATE POLICY "Tournament hosts can manage matches"
  ON tournament_matches FOR ALL
  TO authenticated
  USING (
    tournament_id IN (
      SELECT id FROM tournaments WHERE
      (hosted_by = 'club' AND organizer_id IN (SELECT id FROM club_users WHERE user_id = auth.uid())) OR
      (hosted_by = 'organizer' AND organizer_id IN (SELECT id FROM organizer_users WHERE user_id = auth.uid()))
    )
  );

-- =========================
-- Helper Function
-- =========================
CREATE OR REPLACE FUNCTION get_recent_database_changes()
RETURNS TABLE (
  entity_type TEXT,
  entity_id UUID,
  change_action TEXT,
  entity_name TEXT,
  change_summary TEXT,
  changed_at TIMESTAMPTZ
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    rc.entity_type,
    rc.entity_id,
    rc.change_action,
    rc.entity_name,
    rc.change_summary,
    rc.changed_at
  FROM (
    SELECT
      'booking'::text AS entity_type,
      b.id AS entity_id,
      CASE
        WHEN COALESCE(b.updated_at, b.created_at) > b.created_at THEN 'updated'
        ELSE 'created'
      END AS change_action,
      COALESCE(pu.full_name, 'Unknown player') AS entity_name,
      format(
        'Court %s at %s on %s %s',
        COALESCE(c.name, 'Unknown court'),
        COALESCE(club.club_name, 'Unknown club'),
        to_char(cs.date, 'YYYY-MM-DD'),
        to_char(cs.start_time, 'HH24:MI')
      ) AS change_summary,
      GREATEST(b.created_at, COALESCE(b.updated_at, b.created_at)) AS changed_at
    FROM bookings b
    JOIN court_slots cs ON b.slot_id = cs.id
    JOIN courts c ON cs.court_id = c.id
    LEFT JOIN club_users club ON c.club_id = club.id
    LEFT JOIN player_users pu ON b.player_id = pu.id

    UNION ALL

    SELECT
      'tournament'::text AS entity_type,
      t.id AS entity_id,
      CASE
        WHEN COALESCE(t.updated_at, t.created_at) > t.created_at THEN 'updated'
        ELSE 'created'
      END AS change_action,
      t.name AS entity_name,
      format(
        'Hosted by %s (%s)',
        CASE
          WHEN t.hosted_by = 'club' THEN COALESCE(cu.club_name, 'Unknown club')
          WHEN t.hosted_by = 'organizer' THEN COALESCE(ou.organizer_name, 'Unknown organizer')
          ELSE 'Unknown host'
        END,
        t.hosted_by
      ) AS change_summary,
      GREATEST(t.created_at, COALESCE(t.updated_at, t.created_at)) AS changed_at
    FROM tournaments t
    LEFT JOIN club_users cu ON t.hosted_by = 'club' AND t.organizer_id = cu.id
    LEFT JOIN organizer_users ou ON t.hosted_by = 'organizer' AND t.organizer_id = ou.id

    UNION ALL

    SELECT
      'court'::text AS entity_type,
      c.id AS entity_id,
      CASE
        WHEN COALESCE(c.updated_at, c.created_at) > c.created_at THEN 'updated'
        ELSE 'created'
      END AS change_action,
      c.name AS entity_name,
      format(
        '%s • %s',
        COALESCE(club.club_name, 'Unknown club'),
        COALESCE(c.location, 'Location not provided')
      ) AS change_summary,
      GREATEST(c.created_at, COALESCE(c.updated_at, c.created_at)) AS changed_at
    FROM courts c
    LEFT JOIN club_users club ON c.club_id = club.id

    UNION ALL

    SELECT
      'club_profile'::text AS entity_type,
      cu.id AS entity_id,
      CASE
        WHEN COALESCE(cu.updated_at, cu.created_at) > cu.created_at THEN 'updated'
        ELSE 'created'
      END AS change_action,
      cu.club_name AS entity_name,
      format(
        '%s • %s',
        COALESCE(countries.name, 'Country not set'),
        COALESCE(cu.address, 'Address not provided')
      ) AS change_summary,
      GREATEST(cu.created_at, COALESCE(cu.updated_at, cu.created_at)) AS changed_at
    FROM club_users cu
    LEFT JOIN countries ON cu.country_id = countries.id

    UNION ALL

    SELECT
      'player_profile'::text AS entity_type,
      pu.id AS entity_id,
      CASE
        WHEN COALESCE(pu.updated_at, pu.created_at) > pu.created_at THEN 'updated'
        ELSE 'created'
      END AS change_action,
      pu.full_name AS entity_name,
      format(
        '%s • Skill: %s',
        COALESCE(countries.name, 'Country not set'),
        COALESCE(pu.skill_level, 'Unknown')
      ) AS change_summary,
      GREATEST(pu.created_at, COALESCE(pu.updated_at, pu.created_at)) AS changed_at
    FROM player_users pu
    LEFT JOIN countries ON pu.country_id = countries.id

    UNION ALL

    SELECT
      'organizer_profile'::text AS entity_type,
      ou.id AS entity_id,
      CASE
        WHEN COALESCE(ou.updated_at, ou.created_at) > ou.created_at THEN 'updated'
        ELSE 'created'
      END AS change_action,
      ou.organizer_name AS entity_name,
      format(
        '%s • %s',
        COALESCE(countries.name, 'Country not set'),
        COALESCE(ou.company_name, 'Company not provided')
      ) AS change_summary,
      GREATEST(ou.created_at, COALESCE(ou.updated_at, ou.created_at)) AS changed_at
    FROM organizer_users ou
    LEFT JOIN countries ON ou.country_id = countries.id
  ) AS rc
  ORDER BY rc.changed_at DESC
  LIMIT 20;
END;
$$;
