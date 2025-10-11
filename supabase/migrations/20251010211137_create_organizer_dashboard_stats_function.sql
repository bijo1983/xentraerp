/*
  # Organizer Dashboard Statistics Function
  
  1. New Function
    - `get_organizer_dashboard_stats` - Returns comprehensive statistics for an organizer
      - Parameters: organizer_id (uuid)
      - Returns: active_tournaments, total_participants, upcoming_events, total_revenue
  
  2. Purpose
    - Efficiently calculate all organizer dashboard statistics
    - Counts active and upcoming tournaments
    - Sums total participants across all tournaments
    - Calculates total revenue from entry fees
*/

CREATE OR REPLACE FUNCTION get_organizer_dashboard_stats(p_organizer_id UUID)
RETURNS TABLE (
  active_tournaments BIGINT,
  total_participants BIGINT,
  upcoming_events BIGINT,
  total_revenue NUMERIC
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH tournament_stats AS (
    SELECT 
      COUNT(*) FILTER (
        WHERE t.status IN ('registration_open', 'ongoing')
      ) as active_count,
      COUNT(*) FILTER (
        WHERE t.start_date > CURRENT_DATE AND t.status = 'upcoming'
      ) as upcoming_count,
      SUM(
        (SELECT COUNT(*) FROM tournament_participants tp WHERE tp.tournament_id = t.id)
      ) as participant_count,
      SUM(
        (SELECT COUNT(*) FROM tournament_participants tp WHERE tp.tournament_id = t.id) * 
        COALESCE(t.entry_fee, 0)
      ) as revenue_total
    FROM tournaments t
    WHERE t.organizer_id = p_organizer_id
      AND t.hosted_by = 'organizer'
  )
  SELECT 
    COALESCE(ts.active_count, 0),
    COALESCE(ts.participant_count, 0),
    COALESCE(ts.upcoming_count, 0),
    COALESCE(ts.revenue_total, 0)
  FROM tournament_stats ts;
END;
$$;