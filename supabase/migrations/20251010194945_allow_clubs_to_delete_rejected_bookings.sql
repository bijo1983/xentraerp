/*
  # Allow clubs to delete rejected bookings

  1. Changes
    - Add DELETE policy for bookings table
    - Allows clubs to delete bookings for their courts
  
  2. Security
    - Only club owners can delete bookings for their own courts
    - Verifies ownership through court_slots -> courts -> club_users chain
*/

CREATE POLICY "Clubs can delete bookings for their courts"
  ON bookings
  FOR DELETE
  TO authenticated
  USING (
    slot_id IN (
      SELECT cs.id
      FROM court_slots cs
      JOIN courts c ON cs.court_id = c.id
      JOIN club_users cu ON c.club_id = cu.id
      WHERE cu.user_id = auth.uid()
    )
  );
