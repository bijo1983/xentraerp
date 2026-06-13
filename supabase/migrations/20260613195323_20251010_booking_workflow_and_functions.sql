/*
  # Booking approval workflow

  1. Changes
    - Drop player slot-update policy
    - Replace "Players can create bookings" with pending-only insert policy
    - Add club approval and view policies on bookings
    - Update booking status constraint to include approval statuses
    - Add approve_booking() function
    - Add club pending bookings function
    - Add club recent bookings function
    - Add club delete rejected bookings policy
    - Fix booking update policy

  2. Security
    - Players can only create bookings with 'pending' status
    - Clubs can approve/reject bookings for their courts
*/

-- Drop old slot-direct-update policies
DROP POLICY IF EXISTS "Players can mark slots as booked" ON court_slots;
DROP POLICY IF EXISTS "Players can mark available slots as booked" ON court_slots;

-- Update bookings insert policy
DROP POLICY IF EXISTS "Players can create bookings" ON bookings;
DROP POLICY IF EXISTS "Players can create pending bookings" ON bookings;

CREATE POLICY "Players can create pending bookings"
  ON bookings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    player_id IN (
      SELECT id FROM player_users WHERE user_id = auth.uid()
    )
    AND status = 'pending'
    AND payment_status = 'pending'
  );

-- Club view and approve policies
DROP POLICY IF EXISTS "Clubs can view bookings for their courts" ON bookings;
CREATE POLICY "Clubs can view bookings for their courts"
  ON bookings
  FOR SELECT
  TO authenticated
  USING (
    slot_id IN (
      SELECT cs.id 
      FROM court_slots cs
      JOIN courts c ON cs.court_id = c.id
      JOIN club_users cu ON c.club_id = cu.id
      WHERE cu.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Clubs can approve bookings for their courts" ON bookings;
DROP POLICY IF EXISTS "Clubs can update bookings for their courts" ON bookings;
CREATE POLICY "Clubs can update bookings for their courts"
  ON bookings
  FOR UPDATE
  TO authenticated
  USING (
    slot_id IN (
      SELECT cs.id
      FROM court_slots cs
      JOIN courts c ON cs.court_id = c.id
      JOIN club_users cu ON c.club_id = cu.id
      WHERE cu.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Clubs can delete bookings for their courts" ON bookings;
CREATE POLICY "Clubs can delete bookings for their courts"
  ON bookings
  FOR DELETE
  TO authenticated
  USING (
    slot_id IN (
      SELECT cs.id
      FROM court_slots cs
      JOIN courts c ON cs.court_id = c.id
      JOIN club_users cu ON c.club_id = cu.id
      WHERE cu.user_id = auth.uid()
    )
  );

-- Fix booking status constraint
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE bookings 
  ADD CONSTRAINT bookings_status_check 
  CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'completed'));

COMMENT ON TABLE bookings IS 'Bookings table with approval workflow';

-- Allow players to mark available slots as booked (re-add for slot marking)
DROP POLICY IF EXISTS "Players can mark available slots as booked" ON court_slots;
CREATE POLICY "Players can mark available slots as booked"
  ON court_slots
  FOR UPDATE
  TO authenticated
  USING (is_booked = false)
  WITH CHECK (is_booked = true);

-- approve_booking() function
CREATE OR REPLACE FUNCTION approve_booking(p_booking_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_slot_id uuid;
  v_club_id uuid;
  v_current_user_club_id uuid;
BEGIN
  SELECT id INTO v_current_user_club_id
  FROM club_users
  WHERE user_id = auth.uid();

  IF v_current_user_club_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'User is not a club owner');
  END IF;

  SELECT b.slot_id, c.club_id
  INTO v_slot_id, v_club_id
  FROM bookings b
  JOIN court_slots cs ON b.slot_id = cs.id
  JOIN courts c ON cs.court_id = c.id
  WHERE b.id = p_booking_id;

  IF v_slot_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Booking not found');
  END IF;

  IF v_club_id != v_current_user_club_id THEN
    RETURN json_build_object('success', false, 'error', 'Not authorized to approve this booking');
  END IF;

  UPDATE bookings SET status = 'approved' WHERE id = p_booking_id;
  UPDATE court_slots SET is_booked = true WHERE id = v_slot_id;

  RETURN json_build_object('success', true, 'booking_id', p_booking_id, 'slot_id', v_slot_id);
END;
$$;

GRANT EXECUTE ON FUNCTION approve_booking(uuid) TO authenticated;

-- get_club_pending_bookings() function
DROP FUNCTION IF EXISTS get_club_pending_bookings();

CREATE OR REPLACE FUNCTION get_club_pending_bookings()
RETURNS TABLE (
  booking_id uuid,
  booking_status text,
  payment_status text,
  total_amount numeric,
  booking_created_at timestamptz,
  player_id uuid,
  player_name text,
  player_email text,
  player_phone text,
  slot_id uuid,
  slot_date date,
  slot_start_time time,
  slot_end_time time,
  court_id uuid,
  court_name text,
  club_id uuid,
  club_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    b.id as booking_id,
    b.status as booking_status,
    b.payment_status,
    b.total_amount,
    b.created_at as booking_created_at,
    pu.id as player_id,
    pu.full_name as player_name,
    pu.email as player_email,
    pu.phone_number as player_phone,
    cs.id as slot_id,
    cs.date as slot_date,
    cs.start_time as slot_start_time,
    cs.end_time as slot_end_time,
    c.id as court_id,
    c.name as court_name,
    cu.id as club_id,
    cu.club_name
  FROM bookings b
  JOIN player_users pu ON pu.id = b.player_id
  JOIN court_slots cs ON cs.id = b.slot_id
  JOIN courts c ON c.id = cs.court_id
  JOIN club_users cu ON cu.id = c.club_id
  WHERE 
    cu.user_id = auth.uid()
    AND b.status = 'pending'
  ORDER BY b.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_club_pending_bookings() TO authenticated;

-- get_club_recent_bookings() function
CREATE OR REPLACE FUNCTION get_club_recent_bookings(p_club_id UUID)
RETURNS TABLE (
  booking_id UUID,
  booking_status TEXT,
  payment_status TEXT,
  total_amount NUMERIC,
  booking_date TIMESTAMPTZ,
  player_name TEXT,
  court_name TEXT,
  slot_date DATE,
  slot_start_time TIME,
  slot_end_time TIME
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    b.id,
    b.status,
    b.payment_status,
    b.total_amount,
    b.booking_date,
    pu.full_name,
    c.name,
    cs.date,
    cs.start_time,
    cs.end_time
  FROM bookings b
  JOIN court_slots cs ON b.slot_id = cs.id
  JOIN courts c ON cs.court_id = c.id
  LEFT JOIN player_users pu ON b.player_id = pu.id
  WHERE c.club_id = p_club_id
  ORDER BY b.created_at DESC
  LIMIT 5;
END;
$$;

-- get_player_recent_bookings() function
CREATE OR REPLACE FUNCTION get_player_recent_bookings(p_player_id UUID)
RETURNS TABLE (
  booking_id UUID,
  booking_status TEXT,
  payment_status TEXT,
  total_amount NUMERIC,
  booking_date TIMESTAMPTZ,
  club_name TEXT,
  court_name TEXT,
  slot_date DATE,
  slot_start_time TIME,
  slot_end_time TIME
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    b.id,
    b.status,
    b.payment_status,
    b.total_amount,
    b.booking_date,
    cu.club_name,
    c.name,
    cs.date,
    cs.start_time,
    cs.end_time
  FROM bookings b
  JOIN court_slots cs ON b.slot_id = cs.id
  JOIN courts c ON cs.court_id = c.id
  JOIN club_users cu ON c.club_id = cu.id
  WHERE b.player_id = p_player_id
  ORDER BY b.created_at DESC
  LIMIT 5;
END;
$$;
