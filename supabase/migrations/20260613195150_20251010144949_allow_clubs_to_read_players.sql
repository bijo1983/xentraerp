/*
  # Allow Club Users to Read Player Data

  1. Changes
    - Add RLS policy to allow club users to read player_users table
    
  2. Security
    - Only authenticated users with club_users records can read player data
*/

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
