/*
  # Implement booking approval workflow
  
  1. Changes
    - Remove player permission to directly update court slots
    - Bookings remain in 'pending' status until club approves
    - Add new status 'approved' for bookings
    - Only club can approve bookings and update slots
  
  2. Security
    - Players can only create bookings with 'pending' status
    - Clubs can approve bookings and mark slots as booked
    - Removes direct player access to update slots
*/

-- Drop the policy that allows players to mark slots as booked
DROP POLICY IF EXISTS "Players can mark slots as booked" ON court_slots;

-- Update bookings insert policy to ensure only 'pending' status is allowed
DROP POLICY IF EXISTS "Players can create bookings" ON bookings;

CREATE POLICY "Players can create pending bookings"
  ON bookings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    player_id IN (
      SELECT id FROM player_users WHERE user_id = auth.uid()
    )
    AND status = 'pending'
    AND payment_status = 'pending'
  );

-- Add policy for clubs to approve bookings
CREATE POLICY "Clubs can approve bookings for their courts"
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
  )
  WITH CHECK (
    slot_id IN (
      SELECT cs.id 
      FROM court_slots cs
      JOIN courts c ON cs.court_id = c.id
      JOIN club_users cu ON c.club_id = cu.id
      WHERE cu.user_id = auth.uid()
    )
  );

-- Add policy for clubs to view bookings for their courts
CREATE POLICY "Clubs can view bookings for their courts"
  ON bookings
  FOR SELECT
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
