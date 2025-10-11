/*
  # Fix booking status constraint - force schema refresh
  
  1. Changes
    - Drop and recreate the status check constraint
    - Use explicit CHECK syntax to ensure proper constraint
  
  2. Security
    - Maintains data integrity with all approval workflow statuses
*/

-- Drop the constraint completely
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;

-- Add constraint with explicit CHECK clause
ALTER TABLE bookings 
  ADD CONSTRAINT bookings_status_check 
  CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'completed'));

-- Force a schema cache refresh by touching the table
COMMENT ON TABLE bookings IS 'Bookings table with approval workflow - updated constraint';
