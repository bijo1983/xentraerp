/*
  # Badminton Platform Database Schema

  1. New Tables
    - `profiles` - Static user roles (Administrator, Player, Club, Organizer)
    - `countries` - Country reference data
    - `player_users` - Player profiles and details
    - `club_users` - Club profiles and details  
    - `organizer_users` - Organizer profiles and details
    - `admin_users` - Admin profiles and details
    - `courts` - Court information managed by clubs
    - `court_slots` - Available time slots for courts
    - `bookings` - Court booking records
    - `tournaments` - Tournament information
    - `tournament_participants` - Tournament participation records
    - `tournament_matches` - Tournament match records

  2. Security
    - Enable RLS on all tables
    - Add policies for role-based access control
    - Secure user data based on authentication and roles

  3. Key Features
    - Role-based user management
    - Court booking system with slot management
    - Tournament creation and management
    - Multi-country support
*/

-- Create profiles table (static roles)
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now()
);

-- Insert static profile data
INSERT INTO profiles (name, description) VALUES
  ('Administrator', 'Platform administrator with full access'),
  ('Player', 'Individual player who can book courts and join tournaments'),
  ('Club', 'Club that manages courts and can host tournaments'),
  ('Organizer', 'Event organizer who can rent courts and run tournaments')
ON CONFLICT DO NOTHING;

-- Create countries table
CREATE TABLE IF NOT EXISTS countries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  code text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now()
);

-- Insert sample countries
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

-- Create player_users table
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

-- Create club_users table
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

-- Create organizer_users table
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

-- Create admin_users table
CREATE TABLE IF NOT EXISTS admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  full_name text NOT NULL,
  email text NOT NULL,
  profile_id uuid REFERENCES profiles NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create courts table
CREATE TABLE IF NOT EXISTS courts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid REFERENCES club_users NOT NULL,
  name text NOT NULL,
  location text,
  surface_type text DEFAULT 'Synthetic',
  hourly_rate decimal(10,2) DEFAULT 0,
  is_available boolean DEFAULT true,
  amenities text[],
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create court_slots table
CREATE TABLE IF NOT EXISTS court_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  court_id uuid REFERENCES courts NOT NULL,
  date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  is_booked boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Create bookings table
CREATE TABLE IF NOT EXISTS bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid REFERENCES player_users NOT NULL,
  slot_id uuid REFERENCES court_slots NOT NULL,
  booking_date timestamptz DEFAULT now(),
  status text DEFAULT 'booked' CHECK (status IN ('booked', 'cancelled', 'completed')),
  payment_status text DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'refunded')),
  total_amount decimal(10,2),
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create tournaments table
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
  entry_fee decimal(10,2) DEFAULT 0,
  prize_pool decimal(10,2) DEFAULT 0,
  status text DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'registration_open', 'ongoing', 'completed', 'cancelled')),
  tournament_format text DEFAULT 'single_elimination',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create tournament_participants table
CREATE TABLE IF NOT EXISTS tournament_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid REFERENCES tournaments NOT NULL,
  player_id uuid REFERENCES player_users NOT NULL,
  registered_on timestamptz DEFAULT now(),
  payment_status text DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid')),
  UNIQUE(tournament_id, player_id)
);

-- Create tournament_matches table
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

-- Enable Row Level Security
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

-- RLS Policies

-- Profiles (readable by everyone)
CREATE POLICY "Profiles are publicly readable"
  ON profiles FOR SELECT
  TO authenticated
  USING (true);

-- Countries (readable by everyone)
CREATE POLICY "Countries are publicly readable"
  ON countries FOR SELECT
  TO authenticated
  USING (true);

-- Player users policies
CREATE POLICY "Players can read own data"
  ON player_users FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Players can update own data"
  ON player_users FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Anyone can create player profile"
  ON player_users FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Club users policies
CREATE POLICY "Clubs can read own data"
  ON club_users FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Clubs can update own data"
  ON club_users FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Anyone can create club profile"
  ON club_users FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Organizer users policies
CREATE POLICY "Organizers can read own data"
  ON organizer_users FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Organizers can update own data"
  ON organizer_users FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Anyone can create organizer profile"
  ON organizer_users FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Courts policies (clubs can manage their courts, others can view)
CREATE POLICY "Anyone can view courts"
  ON courts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Clubs can manage own courts"
  ON courts FOR ALL
  TO authenticated
  USING (club_id IN (SELECT id FROM club_users WHERE user_id = auth.uid()));

-- Court slots policies
CREATE POLICY "Anyone can view court slots"
  ON court_slots FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Clubs can manage slots for own courts"
  ON court_slots FOR ALL
  TO authenticated
  USING (court_id IN (SELECT id FROM courts WHERE club_id IN (SELECT id FROM club_users WHERE user_id = auth.uid())));

-- Bookings policies
CREATE POLICY "Players can view own bookings"
  ON bookings FOR SELECT
  TO authenticated
  USING (player_id IN (SELECT id FROM player_users WHERE user_id = auth.uid()));

CREATE POLICY "Players can create bookings"
  ON bookings FOR INSERT
  TO authenticated
  WITH CHECK (player_id IN (SELECT id FROM player_users WHERE user_id = auth.uid()));

CREATE POLICY "Players can update own bookings"
  ON bookings FOR UPDATE
  TO authenticated
  USING (player_id IN (SELECT id FROM player_users WHERE user_id = auth.uid()));

-- Tournaments policies
CREATE POLICY "Anyone can view tournaments"
  ON tournaments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Clubs and organizers can create tournaments"
  ON tournaments FOR INSERT
  TO authenticated
  WITH CHECK (
    (hosted_by = 'club' AND organizer_id IN (SELECT id FROM club_users WHERE user_id = auth.uid())) OR
    (hosted_by = 'organizer' AND organizer_id IN (SELECT id FROM organizer_users WHERE user_id = auth.uid()))
  );

CREATE POLICY "Tournament hosts can update their tournaments"
  ON tournaments FOR UPDATE
  TO authenticated
  USING (
    (hosted_by = 'club' AND organizer_id IN (SELECT id FROM club_users WHERE user_id = auth.uid())) OR
    (hosted_by = 'organizer' AND organizer_id IN (SELECT id FROM organizer_users WHERE user_id = auth.uid()))
  );

-- Tournament participants policies
CREATE POLICY "Anyone can view tournament participants"
  ON tournament_participants FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Players can register for tournaments"
  ON tournament_participants FOR INSERT
  TO authenticated
  WITH CHECK (player_id IN (SELECT id FROM player_users WHERE user_id = auth.uid()));

-- Tournament matches policies
CREATE POLICY "Anyone can view tournament matches"
  ON tournament_matches FOR SELECT
  TO authenticated
  USING (true);

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

-- Create indexes for better performance
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