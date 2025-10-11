/*
  # Player Dashboard Statistics Function
  
  1. New Function
    - `get_player_dashboard_stats` - Returns comprehensive statistics for a player
      - Parameters: player_id (uuid)
      - Returns: upcoming_bookings, completed_bookings, total_spent, active_tournaments
  
  2. Purpose
    - Efficiently calculate all player dashboard statistics
    - Filters upcoming bookings by date and status
    - Calculates total spending from paid bookings
    - Counts active tournament participation
*/

CREATE OR REPLACE FUNCTION get_player_dashboard_stats(p_player_id UUID)
RETURNS TABLE (
  upcoming_bookings BIGINT,
  completed_bookings BIGINT,
  total_spent NUMERIC,
  active_tournaments BIGINT
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH booking_stats AS (
    SELECT 
      COUNT(*) FILTER (
        WHERE cs.date >= CURRENT_DATE 
          AND b.status IN ('approved', 'pending')
      ) as upcoming_count,
      COUNT(*) FILTER (
        WHERE b.status = 'completed'
      ) as completed_count,
      SUM(
        CASE 
          WHEN b.payment_status = 'paid' THEN b.total_amount 
          ELSE 0 
        END
      ) as spent_total
    FROM bookings b
    JOIN court_slots cs ON b.slot_id = cs.id
    WHERE b.player_id = p_player_id
  ),
  tournament_stats AS (
    SELECT COUNT(*) as active_count
    FROM tournament_participants tp
    JOIN tournaments t ON tp.tournament_id = t.id
    WHERE tp.player_id = p_player_id
      AND t.status IN ('registration_open', 'ongoing')
  )
  SELECT 
    COALESCE(bs.upcoming_count, 0),
    COALESCE(bs.completed_count, 0),
    COALESCE(bs.spent_total, 0),
    COALESCE(ts.active_count, 0)
  FROM booking_stats bs
  CROSS JOIN tournament_stats ts;
END;
$$;