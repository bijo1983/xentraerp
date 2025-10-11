/*
  # Fix Bahrain Currency Display

  1. Updates
    - Add currency_code 'BHD' for Bahrain
    - Create currency symbol mapping function
    - Test the currency setup for specific user

  2. Changes
    - Drop existing function first to avoid parameter name conflicts
    - Create new function with comprehensive currency support
    - Add BHD -> BD mapping for Bahrain Dinar
*/

-- First, ensure Bahrain has the correct currency code
UPDATE countries 
SET currency_code = 'BHD' 
WHERE code = 'BH' OR name = 'Bahrain';

-- Drop existing function if it exists to avoid parameter name conflicts
DROP FUNCTION IF EXISTS get_currency_symbol(text);

-- Create the currency symbol function with comprehensive currency support
CREATE OR REPLACE FUNCTION get_currency_symbol(input_currency_code text)
RETURNS text AS $$
BEGIN
  RETURN CASE input_currency_code
    WHEN 'USD' THEN '$'
    WHEN 'EUR' THEN '€'
    WHEN 'GBP' THEN '£'
    WHEN 'JPY' THEN '¥'
    WHEN 'CNY' THEN '¥'
    WHEN 'KRW' THEN '₩'
    WHEN 'INR' THEN '₹'
    WHEN 'SGD' THEN 'S$'
    WHEN 'AUD' THEN 'A$'
    WHEN 'CAD' THEN 'C$'
    WHEN 'CHF' THEN 'CHF'
    WHEN 'SEK' THEN 'kr'
    WHEN 'NOK' THEN 'kr'
    WHEN 'DKK' THEN 'kr'
    WHEN 'PLN' THEN 'zł'
    WHEN 'CZK' THEN 'Kč'
    WHEN 'HUF' THEN 'Ft'
    WHEN 'RUB' THEN '₽'
    WHEN 'TRY' THEN '₺'
    WHEN 'BRL' THEN 'R$'
    WHEN 'MXN' THEN '$'
    WHEN 'ARS' THEN '$'
    WHEN 'CLP' THEN '$'
    WHEN 'COP' THEN '$'
    WHEN 'PEN' THEN 'S/'
    WHEN 'ZAR' THEN 'R'
    WHEN 'NGN' THEN '₦'
    WHEN 'KES' THEN 'KSh'
    WHEN 'EGP' THEN 'E£'
    WHEN 'SAR' THEN 'SR'
    WHEN 'AED' THEN 'AED'
    WHEN 'QAR' THEN 'QR'
    WHEN 'KWD' THEN 'KD'
    WHEN 'BHD' THEN 'BD'  -- Bahrain Dinar
    WHEN 'OMR' THEN 'OR'
    WHEN 'JOD' THEN 'JD'
    WHEN 'ILS' THEN '₪'
    WHEN 'MYR' THEN 'RM'
    WHEN 'THB' THEN '฿'
    WHEN 'PHP' THEN '₱'
    WHEN 'IDR' THEN 'Rp'
    WHEN 'VND' THEN '₫'
    WHEN 'TWD' THEN 'NT$'
    WHEN 'HKD' THEN 'HK$'
    WHEN 'NZD' THEN 'NZ$'
    ELSE COALESCE(input_currency_code, '$')
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Simple function to verify user's currency setup
CREATE OR REPLACE FUNCTION verify_user_currency(user_email text)
RETURNS text AS $$
DECLARE
  auth_user_id uuid;
  user_country_id uuid;
  user_type_result text;
  country_name text;
  country_code text;
  currency_code text;
  currency_symbol text;
BEGIN
  -- Get auth user ID
  SELECT id INTO auth_user_id FROM auth.users WHERE auth.users.email = user_email;
  
  IF auth_user_id IS NULL THEN
    RETURN format('❌ User not found: %s', user_email);
  END IF;
  
  -- Check which profile table the user is in and get country_id
  SELECT 'Player', country_id INTO user_type_result, user_country_id 
  FROM player_users WHERE user_id = auth_user_id;
  
  IF user_type_result IS NULL THEN
    SELECT 'Club', country_id INTO user_type_result, user_country_id 
    FROM club_users WHERE user_id = auth_user_id;
  END IF;
  
  IF user_type_result IS NULL THEN
    SELECT 'Organizer', country_id INTO user_type_result, user_country_id 
    FROM organizer_users WHERE user_id = auth_user_id;
  END IF;
  
  IF user_type_result IS NULL THEN
    SELECT 'Admin', NULL INTO user_type_result, user_country_id 
    FROM admin_users WHERE user_id = auth_user_id;
  END IF;
  
  -- Get country information if country_id exists
  IF user_country_id IS NOT NULL THEN
    SELECT c.name, c.code, c.currency_code::text 
    INTO country_name, country_code, currency_code
    FROM countries c WHERE c.id = user_country_id;
    
    currency_symbol := get_currency_symbol(currency_code);
    
    RETURN format(
      '✅ User: %s | Type: %s | Country: %s (%s) | Currency: %s | Symbol: %s',
      user_email,
      COALESCE(user_type_result, 'Unknown'),
      COALESCE(country_name, 'Unknown'),
      COALESCE(country_code, 'N/A'),
      COALESCE(currency_code, 'USD'),
      COALESCE(currency_symbol, '$')
    );
  ELSE
    RETURN format(
      '⚠️ User: %s | Type: %s | Country: Not Set | Currency: USD (default) | Symbol: $',
      user_email,
      COALESCE(user_type_result, 'Unknown')
    );
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Verify the specific user's currency setup
SELECT verify_user_currency('bijo_101@yahoo.co.in') as currency_verification;

-- Clean up the verification function
DROP FUNCTION IF EXISTS verify_user_currency(text);