/*
  # Get Recent Bookings for Club Function
  
  1. New Function
    - `get_club_recent_bookings` - Returns the 5 most recent bookings for a club
      - Parameters: club_id (uuid)
      - Returns: booking details with player info, court info, and slot times
  
  2. Purpose
    - Efficiently fetch recent bookings for display on club dashboard
    - Includes all necessary joins for complete booking information
    - Ordered by creation date (most recent first)
*/

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