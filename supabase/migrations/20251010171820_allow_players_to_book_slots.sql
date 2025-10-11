/*
  # Allow players to mark slots as booked
  
  1. Changes
    - Add policy to allow players to update court_slots.is_booked when creating bookings
  
  2. Security
    - Players can only update the is_booked field to true
    - This enables the booking flow to work properly
*/

CREATE POLICY "Players can mark slots as booked"
  ON court_slots
  FOR UPDATE
  TO authenticated
  USING (is_booked = false)
  WITH CHECK (is_booked = true);
