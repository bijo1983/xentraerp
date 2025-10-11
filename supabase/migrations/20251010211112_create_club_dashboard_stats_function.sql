/*
  # Club Dashboard Statistics Function
  
  1. New Function
    - `get_club_dashboard_stats` - Returns comprehensive statistics for a club
      - Parameters: club_id (uuid)
      - Returns: total_courts, total_bookings, monthly_revenue, active_tournaments, booking_rate
  
  2. Purpose
    - Efficiently calculate all dashboard statistics in a single query
    - Optimized for performance with CTEs
    - Returns current month revenue automatically
*/

CREATE OR REPLACE FUNCTION get_club_dashboard_stats(p_club_id UUID)
RETURNS TABLE (
  total_courts INTEGER,
  total_bookings BIGINT,
  monthly_revenue NUMERIC,
  active_tournaments BIGINT,
  booking_rate NUMERIC
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_current_month_start DATE;
  v_current_month_end DATE;
BEGIN
  v_current_month_start := DATE_TRUNC('month', CURRENT_DATE);
  v_current_month_end := (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

  RETURN QUERY
  WITH court_data AS (
    SELECT 
      COUNT(*)::INTEGER as court_count,
      ARRAY_AGG(c.id) as court_ids
    FROM courts c
    WHERE c.club_id = p_club_id
  ),
  booking_data AS (
    SELECT 
      COUNT(b.id) as booking_count,
      SUM(
        CASE 
          WHEN b.payment_status = 'paid' 
            AND cs.date >= v_current_month_start 
            AND cs.date <= v_current_month_end 
          THEN b.total_amount 
          ELSE 0 
        END
      ) as month_revenue
    FROM bookings b
    JOIN court_slots cs ON b.slot_id = cs.id
    WHERE cs.court_id = ANY(SELECT UNNEST(court_ids) FROM court_data)
  ),
  tournament_data AS (
    SELECT COUNT(*) as active_count
    FROM tournaments t
    WHERE t.organizer_id = p_club_id
      AND t.hosted_by = 'club'
      AND t.status IN ('registration_open', 'ongoing')
  )
  SELECT 
    cd.court_count,
    COALESCE(bd.booking_count, 0),
    COALESCE(bd.month_revenue, 0),
    COALESCE(td.active_count, 0),
    CASE 
      WHEN cd.court_count > 0 THEN 
        ROUND((COALESCE(bd.booking_count, 0)::NUMERIC / cd.court_count), 2)
      ELSE 0
    END as booking_rate
  FROM court_data cd
  CROSS JOIN booking_data bd
  CROSS JOIN tournament_data td;
END;
$$;