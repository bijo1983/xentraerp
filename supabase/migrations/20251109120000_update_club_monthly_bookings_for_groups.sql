-- Ensure group bookings are included when clubs view their monthly schedule
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
    b.id AS booking_id,
    b.status AS booking_status,
    b.payment_status,
    b.total_amount,
    b.notes AS booking_notes,
    b.created_at AS booking_created_at,
    b.player_id,
    pu.full_name AS player_name,
    pu.email AS player_email,
    pu.phone_number AS player_phone,
    b.group_id,
    gu.group_name,
    cs.id AS slot_id,
    cs.date AS slot_date,
    cs.start_time AS slot_start_time,
    cs.end_time AS slot_end_time,
    c.id AS court_id,
    c.name AS court_name,
    c.hourly_rate AS court_hourly_rate
  FROM bookings b
  JOIN court_slots cs ON cs.id = b.slot_id
  JOIN courts c ON c.id = cs.court_id
  JOIN club_users cu ON cu.id = c.club_id
  LEFT JOIN player_users pu ON pu.id = b.player_id
  LEFT JOIN group_users gu ON gu.id = b.group_id
  WHERE
    cu.user_id = auth.uid()
    AND cs.court_id = p_court_id
    AND cs.date BETWEEN p_start_date AND p_end_date
  ORDER BY cs.date, cs.start_time, b.created_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_club_monthly_bookings(uuid, date, date) TO authenticated;
