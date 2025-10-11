/*
  # Get Recent Bookings for Player Function
  
  1. New Function
    - `get_player_recent_bookings` - Returns the 5 most recent bookings for a player
      - Parameters: player_id (uuid)
      - Returns: booking details with club info, court info, and slot times
  
  2. Purpose
    - Efficiently fetch recent bookings for display on player dashboard
    - Includes all necessary joins for complete booking information
    - Ordered by creation date (most recent first)
*/

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