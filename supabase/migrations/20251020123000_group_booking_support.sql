/*
  # Group Booking Support

  1. New role type
     - Adds "Group" profile allowing player groups to manage recurring bookings

  2. New tables
     - `group_users` to store group accounts linked to a club
     - `club_player_memberships` to associate players with clubs
     - `booking_batches` to aggregate multi-slot submissions (player & group)

  3. Table updates
     - Adds `group_id` and `booking_batch_id` to `bookings`
     - Enforces mutual exclusivity between player and group bookings

  4. Stored procedures & helpers
     - `search_club_players` to list eligible players for a club
     - `list_club_groups` to list groups for a club
     - `get_club_monthly_available_slots` to surface all club slots for a month
     - `create_group_booking_batch` to handle multi-slot submissions & pricing

  5. Security
     - Extends auth profile sync to groups
     - Adds RLS policies for new tables and updated access rules for bookings
*/

-- ----------------------------------------------------
-- 1) Extend profiles catalog with Group type
-- ----------------------------------------------------
INSERT INTO profiles (name, description)
SELECT 'Group', 'Group of players who manage recurring club bookings'
WHERE NOT EXISTS (
  SELECT 1 FROM profiles WHERE name = 'Group'
);

-- Allow auth_user_profiles to track group accounts
ALTER TABLE auth_user_profiles
  DROP CONSTRAINT IF EXISTS auth_user_profiles_profile_type_check;
ALTER TABLE auth_user_profiles
  ADD CONSTRAINT auth_user_profiles_profile_type_check
  CHECK (profile_type IN ('Player', 'Club', 'Organizer', 'Administrator', 'Group'));

-- ----------------------------------------------------
-- 2) Create group_users table
-- ----------------------------------------------------
CREATE TABLE IF NOT EXISTS group_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL UNIQUE,
  group_name text NOT NULL,
  email text NOT NULL,
  phone_number text,
  country_id uuid REFERENCES countries NOT NULL,
  profile_id uuid REFERENCES profiles NOT NULL,
  club_id uuid REFERENCES club_users NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (club_id, lower(group_name))
);

ALTER TABLE group_users ENABLE ROW LEVEL SECURITY;

-- RLS: groups manage their own data
CREATE POLICY IF NOT EXISTS "Groups can read own data"
  ON group_users FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Groups can update own data"
  ON group_users FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Clubs may view/manage groups attached to them
CREATE POLICY IF NOT EXISTS "Clubs can read their groups"
  ON group_users FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM club_users cu
    WHERE cu.id = group_users.club_id
      AND cu.user_id = auth.uid()
  ));

CREATE POLICY IF NOT EXISTS "Groups or clubs can create groups"
  ON group_users FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM club_users cu
      WHERE cu.id = group_users.club_id
        AND cu.user_id = auth.uid()
    )
  );

-- ----------------------------------------------------
-- 3) Club player membership mapping
-- ----------------------------------------------------
CREATE TABLE IF NOT EXISTS club_player_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid REFERENCES club_users NOT NULL,
  player_id uuid REFERENCES player_users NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'active', 'rejected')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (club_id, player_id)
);

ALTER TABLE club_player_memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Players can view their club memberships"
  ON club_player_memberships FOR SELECT
  TO authenticated
  USING (player_id IN (
    SELECT id FROM player_users WHERE user_id = auth.uid()
  ));

CREATE POLICY IF NOT EXISTS "Players can request membership"
  ON club_player_memberships FOR INSERT
  TO authenticated
  WITH CHECK (
    player_id IN (SELECT id FROM player_users WHERE user_id = auth.uid())
  );

CREATE POLICY IF NOT EXISTS "Clubs manage their memberships"
  ON club_player_memberships FOR ALL
  TO authenticated
  USING (club_id IN (
    SELECT id FROM club_users WHERE user_id = auth.uid()
  ))
  WITH CHECK (club_id IN (
    SELECT id FROM club_users WHERE user_id = auth.uid()
  ));

-- ----------------------------------------------------
-- 4) Booking batches for multi-slot submissions
-- ----------------------------------------------------
CREATE TABLE IF NOT EXISTS booking_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid REFERENCES auth.users NOT NULL,
  club_id uuid REFERENCES club_users NOT NULL,
  player_id uuid REFERENCES player_users,
  group_id uuid REFERENCES group_users,
  booking_type text NOT NULL DEFAULT 'player'
    CHECK (booking_type IN ('player', 'group', 'club_player', 'club_group')),
  booking_month date NOT NULL,
  total_amount numeric(10,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'completed')),
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE booking_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Stakeholders can view booking batches"
  ON booking_batches FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid()
    OR club_id IN (SELECT id FROM club_users WHERE user_id = auth.uid())
    OR player_id IN (SELECT id FROM player_users WHERE user_id = auth.uid())
    OR group_id IN (SELECT id FROM group_users WHERE user_id = auth.uid())
  );

-- ----------------------------------------------------
-- 5) Augment bookings table
-- ----------------------------------------------------
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES group_users,
  ADD COLUMN IF NOT EXISTS booking_batch_id uuid REFERENCES booking_batches,
  ALTER COLUMN player_id DROP NOT NULL;

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_player_or_group_chk;
ALTER TABLE bookings ADD CONSTRAINT bookings_player_or_group_chk
  CHECK (
    (player_id IS NOT NULL AND group_id IS NULL)
    OR (player_id IS NULL AND group_id IS NOT NULL)
  );

-- ----------------------------------------------------
-- 6) Refresh bookings RLS policies to support clubs & groups
-- ----------------------------------------------------
DROP POLICY IF EXISTS "Players can view own bookings" ON bookings;
CREATE POLICY "Players and groups can view own bookings"
  ON bookings FOR SELECT
  TO authenticated
  USING (
    player_id IN (SELECT id FROM player_users WHERE user_id = auth.uid())
    OR group_id IN (SELECT id FROM group_users WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Players can create bookings" ON bookings;
CREATE POLICY "Players can create bookings"
  ON bookings FOR INSERT
  TO authenticated
  WITH CHECK (
    player_id IN (SELECT id FROM player_users WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Players can update own bookings" ON bookings;
CREATE POLICY "Players can update own bookings"
  ON bookings FOR UPDATE
  TO authenticated
  USING (player_id IN (SELECT id FROM player_users WHERE user_id = auth.uid()))
  WITH CHECK (player_id IN (SELECT id FROM player_users WHERE user_id = auth.uid()));

-- Clubs should be able to read & manage bookings for their courts
CREATE POLICY IF NOT EXISTS "Clubs can view bookings for own courts"
  ON bookings FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM court_slots cs
    JOIN courts c ON c.id = cs.court_id
    JOIN club_users cu ON cu.id = c.club_id
    WHERE cs.id = bookings.slot_id
      AND cu.user_id = auth.uid()
  ));

CREATE POLICY IF NOT EXISTS "Clubs can create bookings for own courts"
  ON bookings FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1
    FROM court_slots cs
    JOIN courts c ON c.id = cs.court_id
    JOIN club_users cu ON cu.id = c.club_id
    WHERE cs.id = bookings.slot_id
      AND cu.user_id = auth.uid()
  ));

CREATE POLICY IF NOT EXISTS "Clubs can update bookings for own courts"
  ON bookings FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM court_slots cs
    JOIN courts c ON c.id = cs.court_id
    JOIN club_users cu ON cu.id = c.club_id
    WHERE cs.id = bookings.slot_id
      AND cu.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1
    FROM court_slots cs
    JOIN courts c ON c.id = cs.court_id
    JOIN club_users cu ON cu.id = c.club_id
    WHERE cs.id = bookings.slot_id
      AND cu.user_id = auth.uid()
  ));

-- Groups shouldn't insert directly; handled via RPC. Allow them to view via first policy.

-- ----------------------------------------------------
-- 7) Helper functions
-- ----------------------------------------------------

-- Normalize profile lookup to include groups
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
      WHEN aup.profile_type = 'Group' THEN (SELECT gu.group_name FROM group_users gu WHERE gu.id = aup.profile_id)
      ELSE 'Unknown'
    END AS profile_name
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

    IF FOUND THEN RETURN; END IF;

    RETURN QUERY
    SELECT 'Group'::text, gu.id, gu.group_name
    FROM group_users gu
    WHERE gu.user_id = auth_user_id
    LIMIT 1;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Sync helper for group profiles
CREATE OR REPLACE FUNCTION sync_group_profile()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM sync_auth_user_profile(NEW.user_id, 'Group', NEW.id);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM auth_user_profiles WHERE user_id = OLD.user_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_group_profile_trigger ON group_users;
CREATE TRIGGER sync_group_profile_trigger
  AFTER INSERT OR DELETE ON group_users
  FOR EACH ROW EXECUTE FUNCTION sync_group_profile();

-- ----------------------------------------------------
-- 8) RPC helpers for clubs
-- ----------------------------------------------------
CREATE OR REPLACE FUNCTION search_club_players(p_club_id uuid, p_query text DEFAULT NULL)
RETURNS TABLE (
  player_id uuid,
  full_name text,
  email text,
  phone_number text
) AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM club_users cu WHERE cu.id = p_club_id AND cu.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized to view players for this club';
  END IF;

  RETURN QUERY
  SELECT
    pu.id,
    pu.full_name,
    pu.email,
    pu.phone_number
  FROM club_player_memberships cpm
  JOIN player_users pu ON pu.id = cpm.player_id
  WHERE cpm.club_id = p_club_id
    AND cpm.status IN ('approved', 'active')
    AND (
      p_query IS NULL
      OR pu.full_name ILIKE '%' || p_query || '%'
      OR pu.email ILIKE '%' || p_query || '%'
      OR pu.phone_number ILIKE '%' || p_query || '%'
    )
  ORDER BY pu.full_name
  LIMIT 50;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION search_club_players(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION list_club_groups(p_club_id uuid)
RETURNS TABLE (
  group_id uuid,
  group_name text,
  email text,
  phone_number text
) AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM club_users cu WHERE cu.id = p_club_id AND cu.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized to view groups for this club';
  END IF;

  RETURN QUERY
  SELECT
    gu.id,
    gu.group_name,
    gu.email,
    gu.phone_number
  FROM group_users gu
  WHERE gu.club_id = p_club_id
  ORDER BY gu.group_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION list_club_groups(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION get_club_monthly_available_slots(p_club_id uuid, p_month date DEFAULT NULL)
RETURNS TABLE (
  slot_id uuid,
  court_id uuid,
  court_name text,
  slot_date date,
  start_time time,
  end_time time,
  effective_price numeric,
  is_booked boolean
) AS $$
DECLARE
  v_month_start date := COALESCE(date_trunc('month', p_month)::date, date_trunc('month', now())::date);
  v_month_end date := (v_month_start + INTERVAL '1 month' - INTERVAL '1 day')::date;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM club_users WHERE id = p_club_id) THEN
    RAISE EXCEPTION 'Club not found';
  END IF;

  IF NOT (
    EXISTS (SELECT 1 FROM club_users cu WHERE cu.id = p_club_id AND cu.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM group_users gu WHERE gu.club_id = p_club_id AND gu.user_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Not authorized to view slots for this club';
  END IF;

  RETURN QUERY
  WITH candidate_slots AS (
    SELECT
      cs.id,
      cs.court_id,
      cs.date,
      cs.start_time,
      cs.end_time,
      cs.is_booked,
      cs.custom_price,
      c.name AS court_name,
      c.hourly_rate,
      COALESCE(
        cs.custom_price,
        calculate_slot_price(cs.court_id, cs.date, cs.start_time, cs.end_time),
        c.hourly_rate
      ) AS effective_price
    FROM court_slots cs
    JOIN courts c ON c.id = cs.court_id
    WHERE c.club_id = p_club_id
      AND cs.date BETWEEN v_month_start AND v_month_end
  )
  SELECT
    id,
    court_id,
    court_name,
    date,
    start_time,
    end_time,
    effective_price,
    is_booked
  FROM candidate_slots s
  WHERE s.is_booked = false
    AND NOT EXISTS (
      SELECT 1 FROM bookings b
      WHERE b.slot_id = s.id
        AND b.status IN ('pending', 'approved', 'completed')
    )
  ORDER BY date, start_time;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION get_club_monthly_available_slots(uuid, date) TO authenticated;

-- Core RPC to create grouped booking submissions
CREATE OR REPLACE FUNCTION create_group_booking_batch(
  p_group_id uuid,
  p_slot_ids uuid[],
  p_booking_month date DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS TABLE (
  batch_id uuid,
  total_amount numeric,
  booking_count integer
) AS $$
DECLARE
  v_group_record group_users%ROWTYPE;
  v_is_group_request boolean := false;
  v_is_club_request boolean := false;
  v_month_start date;
  v_batch_id uuid;
  v_total_amount numeric := 0;
  v_requested_count integer := 0;
BEGIN
  IF p_slot_ids IS NULL OR array_length(p_slot_ids, 1) = 0 THEN
    RAISE EXCEPTION 'At least one slot must be provided';
  END IF;

  SELECT * INTO v_group_record
  FROM group_users
  WHERE id = p_group_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group not found';
  END IF;

  IF v_group_record.user_id = auth.uid() THEN
    v_is_group_request := true;
  ELSIF EXISTS (SELECT 1 FROM club_users cu WHERE cu.id = v_group_record.club_id AND cu.user_id = auth.uid()) THEN
    v_is_club_request := true;
  ELSE
    RAISE EXCEPTION 'Not authorized to submit bookings for this group';
  END IF;

  v_requested_count := array_length(p_slot_ids, 1);

  WITH slot_data AS (
    SELECT
      cs.id,
      cs.date,
      cs.start_time,
      cs.end_time,
      cs.is_booked,
      cs.custom_price,
      c.id AS court_id,
      c.name AS court_name,
      c.hourly_rate,
      c.club_id,
      COALESCE(
        cs.custom_price,
        calculate_slot_price(cs.court_id, cs.date, cs.start_time, cs.end_time),
        c.hourly_rate
      ) AS effective_price
    FROM court_slots cs
    JOIN courts c ON c.id = cs.court_id
    WHERE cs.id = ANY (p_slot_ids)
  )
  SELECT
    SUM(effective_price),
    COUNT(*),
    date_trunc('month', MIN(date))::date
  INTO v_total_amount, v_requested_count, v_month_start
  FROM slot_data;

  IF v_requested_count IS NULL OR v_requested_count = 0 THEN
    RAISE EXCEPTION 'Requested slots not found';
  END IF;

  IF EXISTS (
    SELECT 1 FROM slot_data s
    WHERE s.club_id <> v_group_record.club_id
  ) THEN
    RAISE EXCEPTION 'Slots must belong to the same club as the group';
  END IF;

  IF EXISTS (
    SELECT 1 FROM slot_data s
    WHERE date_trunc('month', s.date)::date <> COALESCE(date_trunc('month', p_booking_month)::date, v_month_start)
  ) THEN
    RAISE EXCEPTION 'All slots must be within the same month';
  END IF;

  IF EXISTS (
    SELECT 1 FROM slot_data s
    WHERE s.is_booked = true
       OR EXISTS (
         SELECT 1 FROM bookings b
         WHERE b.slot_id = s.id
           AND b.status IN ('pending', 'approved', 'completed')
       )
  ) THEN
    RAISE EXCEPTION 'One or more slots are already booked';
  END IF;

  v_month_start := COALESCE(date_trunc('month', p_booking_month)::date, v_month_start);

  INSERT INTO booking_batches (
    created_by,
    club_id,
    player_id,
    group_id,
    booking_type,
    booking_month,
    total_amount,
    status,
    notes
  )
  VALUES (
    auth.uid(),
    v_group_record.club_id,
    NULL,
    p_group_id,
    CASE WHEN v_is_group_request THEN 'group' ELSE 'club_group' END,
    v_month_start,
    v_total_amount,
    'pending',
    p_notes
  )
  RETURNING id INTO v_batch_id;

  INSERT INTO bookings (
    player_id,
    group_id,
    slot_id,
    total_amount,
    status,
    payment_status,
    notes,
    booking_batch_id
  )
  SELECT
    NULL,
    p_group_id,
    cs.id,
    COALESCE(
      cs.custom_price,
      calculate_slot_price(cs.court_id, cs.date, cs.start_time, cs.end_time),
      c.hourly_rate
    ),
    'pending',
    'pending',
    p_notes,
    v_batch_id
  FROM court_slots cs
  JOIN courts c ON c.id = cs.court_id
  WHERE cs.id = ANY (p_slot_ids);

  UPDATE court_slots
  SET is_booked = true
  WHERE id = ANY (p_slot_ids);

  RETURN QUERY
  SELECT v_batch_id, v_total_amount, v_requested_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION create_group_booking_batch(uuid, uuid[], date, text) TO authenticated;

-- ----------------------------------------------------
-- 9) Auth profile synchronisation adjustments
-- ----------------------------------------------------
DROP TRIGGER IF EXISTS sync_group_profile_trigger ON group_users;
CREATE TRIGGER sync_group_profile_trigger
  AFTER INSERT OR DELETE ON group_users
  FOR EACH ROW EXECUTE FUNCTION sync_group_profile();

-- Ensure existing sync triggers remain
DROP TRIGGER IF EXISTS sync_player_profile_trigger ON player_users;
CREATE TRIGGER sync_player_profile_trigger
  AFTER INSERT OR DELETE ON player_users
  FOR EACH ROW EXECUTE FUNCTION sync_player_profile();

DROP TRIGGER IF EXISTS sync_club_profile_trigger ON club_users;
CREATE TRIGGER sync_club_profile_trigger
  AFTER INSERT OR DELETE ON club_users
  FOR EACH ROW EXECUTE FUNCTION sync_club_profile();

DROP TRIGGER IF EXISTS sync_organizer_profile_trigger ON organizer_users;
CREATE TRIGGER sync_organizer_profile_trigger
  AFTER INSERT OR DELETE ON organizer_users
  FOR EACH ROW EXECUTE FUNCTION sync_organizer_profile();

DROP TRIGGER IF EXISTS sync_admin_profile_trigger ON admin_users;
CREATE TRIGGER sync_admin_profile_trigger
  AFTER INSERT OR DELETE ON admin_users
  FOR EACH ROW EXECUTE FUNCTION sync_admin_profile();
