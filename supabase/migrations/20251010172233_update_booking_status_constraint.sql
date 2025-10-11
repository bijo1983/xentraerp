/*
  # Update booking status constraint
  
  1. Changes
    - Drop old status check constraint
    - Add new constraint allowing: pending, approved, rejected, cancelled, completed
  
  2. Security
    - Maintains data integrity with updated valid status values
*/

-- Drop the old constraint
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;

-- Add new constraint with approval workflow statuses
ALTER TABLE bookings ADD CONSTRAINT bookings_status_check 
  CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'completed'));
