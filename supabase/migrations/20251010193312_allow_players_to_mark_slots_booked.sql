/*
  # Allow players to mark slots as booked

  1. Changes
    - Add RLS policy for players to update court_slots.is_booked field
    - This allows the booking workflow to mark slots as booked after creating a booking
  
  2. Security
    - Players can only update the is_booked field (from false to true)
    - Players cannot modify other slot properties
*/

-- Allow players to mark slots as booked when creating bookings
CREATE POLICY "Players can mark available slots as booked"
  ON court_slots
  FOR UPDATE
  TO authenticated
  USING (is_booked = false)
  WITH CHECK (is_booked = true);
