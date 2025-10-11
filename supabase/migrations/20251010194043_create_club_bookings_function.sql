/*
  # Create stored procedure to list club bookings

  1. New Function
    - `get_club_pending_bookings()` - Returns all pending bookings for the logged-in club user
    - Filters by status = 'pending'
    - Returns booking details with player info and slot details
  
  2. Security
    - Function uses SECURITY INVOKER to run with caller's permissions
    - Respects existing RLS policies
    - Only returns bookings for courts owned by the logged-in club
*/

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
SECURITY INVOKER
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
    c.court_name,
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

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_club_pending_bookings() TO authenticated;
