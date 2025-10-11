/*
  # Fix Booking Update Policy for Clubs

  1. Changes
    - Drop existing restrictive UPDATE policy for clubs
    - Create new policy that allows clubs to update booking status
    - Clubs can update any field for bookings on their courts
    - Remove with_check restriction that was blocking status updates

  2. Security
    - Maintains security by checking club ownership via court_slots -> courts -> club_users
    - Allows clubs to approve/reject bookings for their courts
*/

-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "Clubs can approve bookings for their courts" ON bookings;

-- Create new policy that allows clubs to update bookings for their courts
CREATE POLICY "Clubs can update bookings for their courts"
  ON bookings
  FOR UPDATE
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
