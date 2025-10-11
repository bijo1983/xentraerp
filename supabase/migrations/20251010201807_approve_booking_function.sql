/*
  # Create approve_booking function

  1. Purpose
    - Atomically approve a booking and mark the slot as booked
    - Ensures both operations succeed or both fail
    - Bypasses RLS issues by running as a secure function

  2. Function Details
    - Takes booking_id as input
    - Updates booking status to 'approved'
    - Updates court_slot is_booked to true
    - Validates that the user is a club owner for the court
    - Returns success/error status

  3. Security
    - Only club owners can approve bookings for their courts
    - Function runs with security definer privileges
*/

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
  -- Get current user's club_id
  SELECT id INTO v_current_user_club_id
  FROM club_users
  WHERE user_id = auth.uid();

  -- Check if user is a club
  IF v_current_user_club_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'User is not a club owner'
    );
  END IF;

  -- Get slot_id and verify club ownership
  SELECT b.slot_id, c.club_id
  INTO v_slot_id, v_club_id
  FROM bookings b
  JOIN court_slots cs ON b.slot_id = cs.id
  JOIN courts c ON cs.court_id = c.id
  WHERE b.id = p_booking_id;

  -- Verify the booking exists
  IF v_slot_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Booking not found'
    );
  END IF;

  -- Verify the club owns this court
  IF v_club_id != v_current_user_club_id THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Not authorized to approve this booking'
    );
  END IF;

  -- Update booking status
  UPDATE bookings
  SET status = 'approved'
  WHERE id = p_booking_id;

  -- Update slot as booked
  UPDATE court_slots
  SET is_booked = true
  WHERE id = v_slot_id;

  RETURN json_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'slot_id', v_slot_id
  );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION approve_booking(uuid) TO authenticated;