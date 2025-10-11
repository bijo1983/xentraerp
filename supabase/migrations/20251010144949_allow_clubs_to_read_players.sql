/*
  # Allow Club Users to Read Player Data

  1. Changes
    - Add RLS policy to allow club users to read player_users table
    - This is necessary for clubs to create bookings on behalf of players
    
  2. Security
    - Only authenticated users with club_users records can read player data
    - This maintains security while allowing clubs to manage bookings
*/

-- Drop existing policy if it exists and create new one
DROP POLICY IF EXISTS "Clubs can read all players" ON player_users;

CREATE POLICY "Clubs can read all players"
  ON player_users
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM club_users
      WHERE club_users.user_id = auth.uid()
    )
  );
