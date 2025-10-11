/*
  # Add Peak Hour Pricing Support

  1. New Tables
    - `court_peak_hours` - Define peak hour time ranges and pricing for courts
    - Links to courts table and allows multiple peak hour periods per court

  2. Features
    - Multiple peak hour periods per court (e.g., morning rush, evening rush)
    - Different pricing multipliers or fixed rates for peak periods
    - Day-of-week specific peak hours
    - Flexible time range definitions

  3. Security
    - Enable RLS on new table
    - Club owners can manage their own court peak hours
*/

-- Create court peak hours table
CREATE TABLE IF NOT EXISTS court_peak_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  court_id uuid REFERENCES courts NOT NULL,
  name text NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  days_of_week integer[] DEFAULT '{1,2,3,4,5,6,7}',
  pricing_type text DEFAULT 'multiplier' CHECK (pricing_type IN ('multiplier', 'fixed')),
  pricing_value decimal(10,2) NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE court_peak_hours ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Club owners can view their court peak hours"
  ON court_peak_hours FOR SELECT
  TO authenticated
  USING (
    court_id IN (
      SELECT c.id FROM courts c
      JOIN club_users cu ON c.club_id = cu.id
      WHERE cu.user_id = auth.uid()
    )
  );

CREATE POLICY "Club owners can manage their court peak hours"
  ON court_peak_hours FOR ALL
  TO authenticated
  USING (
    court_id IN (
      SELECT c.id FROM courts c
      JOIN club_users cu ON c.club_id = cu.id
      WHERE cu.user_id = auth.uid()
    )
  )
  WITH CHECK (
    court_id IN (
      SELECT c.id FROM courts c
      JOIN club_users cu ON c.club_id = cu.id
      WHERE cu.user_id = auth.uid()
    )
  );

-- Function to calculate peak hour pricing for a slot
CREATE OR REPLACE FUNCTION calculate_slot_price(
  p_court_id uuid,
  p_date date,
  p_start_time time,
  p_end_time time
)
RETURNS decimal(10,2) AS $$
DECLARE
  base_rate decimal(10,2);
  peak_multiplier decimal(10,2) := 1.0;
  peak_fixed_rate decimal(10,2) := NULL;
  day_of_week integer;
  peak_hour_record RECORD;
BEGIN
  -- Get base hourly rate
  SELECT hourly_rate INTO base_rate
  FROM courts
  WHERE id = p_court_id;
  
  IF base_rate IS NULL THEN
    RETURN 0;
  END IF;
  
  -- Get day of week (1=Monday, 7=Sunday)
  day_of_week := EXTRACT(DOW FROM p_date);
  IF day_of_week = 0 THEN
    day_of_week := 7;
  END IF;
  
  -- Check for applicable peak hours
  FOR peak_hour_record IN
    SELECT pricing_type, pricing_value
    FROM court_peak_hours
    WHERE court_id = p_court_id
      AND is_active = true
      AND day_of_week = ANY(days_of_week)
      AND (
        (p_start_time >= start_time AND p_start_time < end_time) OR
        (p_end_time > start_time AND p_end_time <= end_time) OR
        (p_start_time <= start_time AND p_end_time >= end_time)
      )
    ORDER BY pricing_value DESC
    LIMIT 1
  LOOP
    IF peak_hour_record.pricing_type = 'fixed' THEN
      peak_fixed_rate := peak_hour_record.pricing_value;
      EXIT;
    ELSE
      peak_multiplier := GREATEST(peak_multiplier, peak_hour_record.pricing_value);
    END IF;
  END LOOP;
  
  -- Return calculated price
  IF peak_fixed_rate IS NOT NULL THEN
    RETURN peak_fixed_rate;
  ELSE
    RETURN base_rate * peak_multiplier;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_court_peak_hours_court_id ON court_peak_hours(court_id);
CREATE INDEX IF NOT EXISTS idx_court_peak_hours_times ON court_peak_hours(start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_court_peak_hours_active ON court_peak_hours(is_active) WHERE is_active = true;