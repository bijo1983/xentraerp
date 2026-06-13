/*
  # Dashboard statistics functions

  1. New Functions
    - `get_club_dashboard_stats` - Club dashboard metrics
    - `get_player_dashboard_stats` - Player dashboard metrics
    - `get_organizer_dashboard_stats` - Organizer dashboard metrics
    - `get_recent_database_changes` - Activity feed
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

CREATE OR REPLACE FUNCTION get_recent_database_changes()
RETURNS TABLE (
  entity_type TEXT,
  entity_id UUID,
  change_action TEXT,
  entity_name TEXT,
  change_summary TEXT,
  changed_at TIMESTAMPTZ
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    rc.entity_type,
    rc.entity_id,
    rc.change_action,
    rc.entity_name,
    rc.change_summary,
    rc.changed_at
  FROM (
    SELECT
      'booking'::text AS entity_type,
      b.id AS entity_id,
      CASE
        WHEN COALESCE(b.updated_at, b.created_at) > b.created_at THEN 'updated'
        ELSE 'created'
      END AS change_action,
      COALESCE(pu.full_name, 'Unknown player') AS entity_name,
      format(
        'Court %s at %s on %s %s',
        COALESCE(c.name, 'Unknown court'),
        COALESCE(club.club_name, 'Unknown club'),
        to_char(cs.date, 'YYYY-MM-DD'),
        to_char(cs.start_time, 'HH24:MI')
      ) AS change_summary,
      GREATEST(b.created_at, COALESCE(b.updated_at, b.created_at)) AS changed_at
    FROM bookings b
    JOIN court_slots cs ON b.slot_id = cs.id
    JOIN courts c ON cs.court_id = c.id
    LEFT JOIN club_users club ON c.club_id = club.id
    LEFT JOIN player_users pu ON b.player_id = pu.id

    UNION ALL

    SELECT
      'tournament'::text AS entity_type,
      t.id AS entity_id,
      CASE
        WHEN COALESCE(t.updated_at, t.created_at) > t.created_at THEN 'updated'
        ELSE 'created'
      END AS change_action,
      t.name AS entity_name,
      format(
        'Hosted by %s (%s)',
        CASE
          WHEN t.hosted_by = 'club' THEN COALESCE(cu.club_name, 'Unknown club')
          WHEN t.hosted_by = 'organizer' THEN COALESCE(ou.organizer_name, 'Unknown organizer')
          ELSE 'Unknown host'
        END,
        t.hosted_by
      ) AS change_summary,
      GREATEST(t.created_at, COALESCE(t.updated_at, t.created_at)) AS changed_at
    FROM tournaments t
    LEFT JOIN club_users cu ON t.hosted_by = 'club' AND t.organizer_id = cu.id
    LEFT JOIN organizer_users ou ON t.hosted_by = 'organizer' AND t.organizer_id = ou.id

    UNION ALL

    SELECT
      'court'::text AS entity_type,
      c.id AS entity_id,
      CASE
        WHEN COALESCE(c.updated_at, c.created_at) > c.created_at THEN 'updated'
        ELSE 'created'
      END AS change_action,
      c.name AS entity_name,
      format(
        '%s • %s',
        COALESCE(club.club_name, 'Unknown club'),
        COALESCE(c.location, 'Location not provided')
      ) AS change_summary,
      GREATEST(c.created_at, COALESCE(c.updated_at, c.created_at)) AS changed_at
    FROM courts c
    LEFT JOIN club_users club ON c.club_id = club.id

    UNION ALL

    SELECT
      'club_profile'::text AS entity_type,
      cu.id AS entity_id,
      CASE
        WHEN COALESCE(cu.updated_at, cu.created_at) > cu.created_at THEN 'updated'
        ELSE 'created'
      END AS change_action,
      cu.club_name AS entity_name,
      format(
        '%s • %s',
        COALESCE(countries.name, 'Country not set'),
        COALESCE(cu.address, 'Address not provided')
      ) AS change_summary,
      GREATEST(cu.created_at, COALESCE(cu.updated_at, cu.created_at)) AS changed_at
    FROM club_users cu
    LEFT JOIN countries ON cu.country_id = countries.id

    UNION ALL

    SELECT
      'player_profile'::text AS entity_type,
      pu.id AS entity_id,
      CASE
        WHEN COALESCE(pu.updated_at, pu.created_at) > pu.created_at THEN 'updated'
        ELSE 'created'
      END AS change_action,
      pu.full_name AS entity_name,
      format(
        '%s • Skill: %s',
        COALESCE(countries.name, 'Country not set'),
        COALESCE(pu.skill_level, 'Unknown')
      ) AS change_summary,
      GREATEST(pu.created_at, COALESCE(pu.updated_at, pu.created_at)) AS changed_at
    FROM player_users pu
    LEFT JOIN countries ON pu.country_id = countries.id

    UNION ALL

    SELECT
      'organizer_profile'::text AS entity_type,
      ou.id AS entity_id,
      CASE
        WHEN COALESCE(ou.updated_at, ou.created_at) > ou.created_at THEN 'updated'
        ELSE 'created'
      END AS change_action,
      ou.organizer_name AS entity_name,
      format(
        '%s • %s',
        COALESCE(countries.name, 'Country not set'),
        COALESCE(ou.company_name, 'Company not provided')
      ) AS change_summary,
      GREATEST(ou.created_at, COALESCE(ou.updated_at, ou.created_at)) AS changed_at
    FROM organizer_users ou
    LEFT JOIN countries ON ou.country_id = countries.id
  ) AS rc
  ORDER BY rc.changed_at DESC
  LIMIT 20;
END;
$$;
