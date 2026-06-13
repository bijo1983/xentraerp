/*
  # Group Booking Support

  1. New role type
     - Adds "Group" profile

  2. New tables
     - `group_users` - group accounts linked to a club
     - `club_player_memberships` - player-club associations
     - `booking_batches` - multi-slot submissions

  3. Table updates
     - Adds `group_id` and `booking_batch_id` to `bookings`

  4. Stored procedures
     - `search_club_players`, `list_club_groups`
     - `get_club_monthly_available_slots`, `create_group_booking_batch`
     - `approve_booking_batch`, `reject_booking_batch`
     - `get_club_monthly_bookings`

  5. Security
     - Extends auth profile sync to groups
     - Adds RLS policies for new tables
*/

INSERT INTO profiles (name, description)
SELECT 'Group', 'Group of players who manage recurring club bookings'
WHERE NOT EXISTS (SELECT 1 FROM profiles WHERE name = 'Group');

ALTER TABLE auth_user_profiles
  DROP CONSTRAINT IF EXISTS auth_user_profiles_profile_type_check;
ALTER TABLE auth_user_profiles
  ADD CONSTRAINT auth_user_profiles_profile_type_check
  CHECK (profile_type IN ('Player', 'Club', 'Organizer', 'Administrator', 'Group'));

CREATE TABLE IF NOT EXISTS group_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL UNIQUE,
  group_name text NOT NULL,
  email text NOT NULL,
  phone_number text,
  country_id uuid REFERENCES countries NOT NULL,
  profile_id uuid REFERENCES profiles NOT NULL,
  club_id uuid REFERENCES club_users,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE group_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Groups can read own data" ON group_users;
CREATE POLICY "Groups can read own data"
  ON group_users FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Groups can update own data" ON group_users;
CREATE POLICY "Groups can update own data"
  ON group_users FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Clubs can read their groups" ON group_users;
CREATE POLICY "Clubs can read their groups"
  ON group_users FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM club_users cu
    WHERE cu.id = group_users.club_id AND cu.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Groups or clubs can create groups" ON group_users;
CREATE POLICY "Groups or clubs can create groups"
  ON group_users FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM club_users cu
      WHERE cu.id = group_users.club_id AND cu.user_id = auth.uid()
    )
  );

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

DROP POLICY IF EXISTS "Players can view their club memberships" ON club_player_memberships;
CREATE POLICY "Players can view their club memberships"
  ON club_player_memberships FOR SELECT
  TO authenticated
  USING (player_id IN (SELECT id FROM player_users WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Players can request membership" ON club_player_memberships;
CREATE POLICY "Players can request membership"
  ON club_player_memberships FOR INSERT
  TO authenticated
  WITH CHECK (player_id IN (SELECT id FROM player_users WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Clubs manage their memberships" ON club_player_memberships;
CREATE POLICY "Clubs manage their memberships"
  ON club_player_memberships FOR ALL
  TO authenticated
  USING (club_id IN (SELECT id FROM club_users WHERE user_id = auth.uid()))
  WITH CHECK (club_id IN (SELECT id FROM club_users WHERE user_id = auth.uid()));

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

DROP POLICY IF EXISTS "Stakeholders can view booking batches" ON booking_batches;
CREATE POLICY "Stakeholders can view booking batches"
  ON booking_batches FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid()
    OR club_id IN (SELECT id FROM club_users WHERE user_id = auth.uid())
    OR player_id IN (SELECT id FROM player_users WHERE user_id = auth.uid())
    OR group_id IN (SELECT id FROM group_users WHERE user_id = auth.uid())
  );

-- Create booking_batch_items table for batch approval functions
CREATE TABLE IF NOT EXISTS booking_batch_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid REFERENCES booking_batches NOT NULL,
  slot_id uuid REFERENCES court_slots NOT NULL,
  price numeric(10,2),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE booking_batch_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Stakeholders can view batch items" ON booking_batch_items;
CREATE POLICY "Stakeholders can view batch items"
  ON booking_batch_items FOR SELECT
  TO authenticated
  USING (batch_id IN (
    SELECT id FROM booking_batches WHERE
      created_by = auth.uid()
      OR club_id IN (SELECT id FROM club_users WHERE user_id = auth.uid())
      OR player_id IN (SELECT id FROM player_users WHERE user_id = auth.uid())
      OR group_id IN (SELECT id FROM group_users WHERE user_id = auth.uid())
  ));

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES group_users,
  ADD COLUMN IF NOT EXISTS booking_batch_id uuid REFERENCES booking_batches;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'player_id' AND is_nullable = 'NO') THEN
    ALTER TABLE bookings ALTER COLUMN player_id DROP NOT NULL;
  END IF;
END $$;

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_player_or_group_chk;
ALTER TABLE bookings ADD CONSTRAINT bookings_player_or_group_chk
  CHECK (
    (player_id IS NOT NULL AND group_id IS NULL)
    OR (player_id IS NULL AND group_id IS NOT NULL)
  );

DROP POLICY IF EXISTS "Players can view own bookings" ON bookings;
DROP POLICY IF EXISTS "Players and groups can view own bookings" ON bookings;
CREATE POLICY "Players and groups can view own bookings"
  ON bookings FOR SELECT
  TO authenticated
  USING (
    player_id IN (SELECT id FROM player_users WHERE user_id = auth.uid())
    OR group_id IN (SELECT id FROM group_users WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Clubs can view bookings for own courts" ON bookings;
CREATE POLICY "Clubs can view bookings for own courts"
  ON bookings FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM court_slots cs
    JOIN courts c ON c.id = cs.court_id
    JOIN club_users cu ON cu.id = c.club_id
    WHERE cs.id = bookings.slot_id AND cu.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Clubs can create bookings for own courts" ON bookings;
CREATE POLICY "Clubs can create bookings for own courts"
  ON bookings FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1
    FROM court_slots cs
    JOIN courts c ON c.id = cs.court_id
    JOIN club_users cu ON cu.id = c.club_id
    WHERE cs.id = bookings.slot_id AND cu.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Clubs can update bookings for own courts" ON bookings;
CREATE POLICY "Clubs can update bookings for own courts"
  ON bookings FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM court_slots cs
    JOIN courts c ON c.id = cs.court_id
    JOIN club_users cu ON cu.id = c.club_id
    WHERE cs.id = bookings.slot_id AND cu.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1
    FROM court_slots cs
    JOIN courts c ON c.id = cs.court_id
    JOIN club_users cu ON cu.id = c.club_id
    WHERE cs.id = bookings.slot_id AND cu.user_id = auth.uid()
  ));

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
    RETURN QUERY SELECT 'Player'::text, pu.id, pu.full_name FROM player_users pu WHERE pu.user_id = auth_user_id LIMIT 1;
    IF FOUND THEN RETURN; END IF;
    RETURN QUERY SELECT 'Club'::text, cu.id, cu.club_name FROM club_users cu WHERE cu.user_id = auth_user_id LIMIT 1;
    IF FOUND THEN RETURN; END IF;
    RETURN QUERY SELECT 'Organizer'::text, ou.id, ou.organizer_name FROM organizer_users ou WHERE ou.user_id = auth_user_id LIMIT 1;
    IF FOUND THEN RETURN; END IF;
    RETURN QUERY SELECT 'Administrator'::text, au.id, au.full_name FROM admin_users au WHERE au.user_id = auth_user_id LIMIT 1;
    IF FOUND THEN RETURN; END IF;
    RETURN QUERY SELECT 'Group'::text, gu.id, gu.group_name FROM group_users gu WHERE gu.user_id = auth_user_id LIMIT 1;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

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

CREATE OR REPLACE FUNCTION search_club_players(p_club_id uuid, p_query text DEFAULT NULL)
RETURNS TABLE (
  player_id uuid,
  full_name text,
  email text,
  phone_number text
) AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM club_users cu WHERE cu.id = p_club_id AND cu.user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized to view players for this club';
  END IF;

  RETURN QUERY
  SELECT pu.id, pu.full_name, pu.email, pu.phone_number
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
  IF NOT EXISTS (SELECT 1 FROM club_users cu WHERE cu.id = p_club_id AND cu.user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized to view groups for this club';
  END IF;

  RETURN QUERY
  SELECT gu.id, gu.group_name, gu.email, gu.phone_number
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
  SELECT id, court_id, court_name, date, start_time, end_time, effective_price, is_booked
  FROM candidate_slots s
  WHERE s.is_booked = false
    AND NOT EXISTS (
      SELECT 1 FROM bookings b
      WHERE b.slot_id = s.id AND b.status IN ('pending', 'approved', 'completed')
    )
  ORDER BY date, start_time;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION get_club_monthly_available_slots(uuid, date) TO authenticated;

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

  SELECT * INTO v_group_record FROM group_users WHERE id = p_group_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Group not found'; END IF;

  IF v_group_record.user_id = auth.uid() THEN
    v_is_group_request := true;
  ELSIF EXISTS (SELECT 1 FROM club_users cu WHERE cu.id = v_group_record.club_id AND cu.user_id = auth.uid()) THEN
    v_is_club_request := true;
  ELSE
    RAISE EXCEPTION 'Not authorized to submit bookings for this group';
  END IF;

  SELECT SUM(COALESCE(cs.custom_price, calculate_slot_price(cs.court_id, cs.date, cs.start_time, cs.end_time), c.hourly_rate)),
         COUNT(*),
         date_trunc('month', MIN(cs.date))::date
  INTO v_total_amount, v_requested_count, v_month_start
  FROM court_slots cs
  JOIN courts c ON c.id = cs.court_id
  WHERE cs.id = ANY (p_slot_ids);

  IF v_requested_count IS NULL OR v_requested_count = 0 THEN
    RAISE EXCEPTION 'Requested slots not found';
  END IF;

  v_month_start := COALESCE(date_trunc('month', p_booking_month)::date, v_month_start);

  INSERT INTO booking_batches (created_by, club_id, player_id, group_id, booking_type, booking_month, total_amount, status, notes)
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

  INSERT INTO bookings (player_id, group_id, slot_id, total_amount, status, payment_status, notes, booking_batch_id)
  SELECT NULL, p_group_id, cs.id,
    COALESCE(cs.custom_price, calculate_slot_price(cs.court_id, cs.date, cs.start_time, cs.end_time), c.hourly_rate),
    'pending', 'pending', p_notes, v_batch_id
  FROM court_slots cs
  JOIN courts c ON c.id = cs.court_id
  WHERE cs.id = ANY (p_slot_ids);

  UPDATE court_slots SET is_booked = true WHERE id = ANY (p_slot_ids);

  RETURN QUERY SELECT v_batch_id, v_total_amount, v_requested_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION create_group_booking_batch(uuid, uuid[], date, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.approve_booking_batch(p_batch_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_club_user_id uuid;
  v_club_id uuid;
BEGIN
  SELECT cu.user_id, bb.club_id INTO v_club_user_id, v_club_id
  FROM booking_batches bb JOIN club_users cu ON cu.id = bb.club_id
  WHERE bb.id = p_batch_id;

  IF v_club_user_id IS NULL THEN
    RAISE EXCEPTION 'Batch % not found', p_batch_id USING ERRCODE = 'P0002';
  END IF;
  IF v_club_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not authorized to approve this batch' USING ERRCODE = '42501';
  END IF;

  UPDATE booking_batches SET status = 'approved', updated_at = now() WHERE id = p_batch_id;
  UPDATE booking_batch_items SET status = 'approved' WHERE batch_id = p_batch_id;
  UPDATE court_slots cs SET is_booked = true
  FROM booking_batch_items bi WHERE bi.batch_id = p_batch_id AND bi.slot_id = cs.id;

  INSERT INTO bookings (player_id, group_id, slot_id, status, payment_status, total_amount, booking_date, booking_batch_id)
  SELECT bb.player_id, bb.group_id, bi.slot_id, 'approved', 'pending', COALESCE(bi.price, 0), now(), bb.id
  FROM booking_batches bb JOIN booking_batch_items bi ON bi.batch_id = bb.id
  WHERE bb.id = p_batch_id
  ON CONFLICT DO NOTHING;

  RETURN json_build_object('success', true, 'batch_id', p_batch_id, 'club_id', v_club_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_booking_batch(p_batch_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_club_user_id uuid;
  v_club_id uuid;
BEGIN
  SELECT cu.user_id, bb.club_id INTO v_club_user_id, v_club_id
  FROM booking_batches bb JOIN club_users cu ON cu.id = bb.club_id
  WHERE bb.id = p_batch_id;

  IF v_club_user_id IS NULL THEN
    RAISE EXCEPTION 'Batch % not found', p_batch_id USING ERRCODE = 'P0002';
  END IF;
  IF v_club_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not authorized to reject this batch' USING ERRCODE = '42501';
  END IF;

  UPDATE booking_batches SET status = 'rejected', updated_at = now() WHERE id = p_batch_id;
  UPDATE booking_batch_items SET status = 'rejected' WHERE batch_id = p_batch_id;
  UPDATE court_slots cs SET is_booked = false
  FROM booking_batch_items bi WHERE bi.batch_id = p_batch_id AND bi.slot_id = cs.id;

  RETURN json_build_object('success', true, 'batch_id', p_batch_id, 'club_id', v_club_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_booking_batch(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_booking_batch(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_club_monthly_bookings(
  p_court_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS TABLE (
  booking_id uuid,
  booking_status text,
  payment_status text,
  total_amount numeric,
  booking_notes text,
  booking_created_at timestamptz,
  player_id uuid,
  player_name text,
  player_email text,
  player_phone text,
  group_id uuid,
  group_name text,
  slot_id uuid,
  slot_date date,
  slot_start_time time,
  slot_end_time time,
  court_id uuid,
  court_name text,
  court_hourly_rate numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    b.id, b.status, b.payment_status, b.total_amount, b.notes,
    b.created_at, b.player_id, pu.full_name, pu.email, pu.phone_number,
    b.group_id, gu.group_name, cs.id, cs.date, cs.start_time, cs.end_time,
    c.id, c.name, c.hourly_rate
  FROM bookings b
  JOIN court_slots cs ON cs.id = b.slot_id
  JOIN courts c ON c.id = cs.court_id
  JOIN club_users cu ON cu.id = c.club_id
  LEFT JOIN player_users pu ON pu.id = b.player_id
  LEFT JOIN group_users gu ON gu.id = b.group_id
  WHERE cu.user_id = auth.uid()
    AND cs.court_id = p_court_id
    AND cs.date BETWEEN p_start_date AND p_end_date
  ORDER BY cs.date, cs.start_time, b.created_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_club_monthly_bookings(uuid, date, date) TO authenticated;
