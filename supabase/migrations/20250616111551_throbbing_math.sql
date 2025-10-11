/*
  # Add Currency Support to Countries

  1. Changes
    - Add currency_code column to countries table
    - Update existing countries with their currency codes
    - Add function to get currency symbol from code

  2. Currency Support
    - Each country will have its currency code (USD, EUR, GBP, etc.)
    - Courts and tournaments will display prices in local currency
    - Support for major world currencies
*/

-- Add currency_code column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'countries' AND column_name = 'currency_code'
  ) THEN
    ALTER TABLE countries ADD COLUMN currency_code varchar(10);
  END IF;
END $$;

-- Update countries with their currency codes
UPDATE countries SET currency_code = 'USD' WHERE code = 'US';
UPDATE countries SET currency_code = 'GBP' WHERE code = 'GB';
UPDATE countries SET currency_code = 'CAD' WHERE code = 'CA';
UPDATE countries SET currency_code = 'AUD' WHERE code = 'AU';
UPDATE countries SET currency_code = 'SGD' WHERE code = 'SG';
UPDATE countries SET currency_code = 'MYR' WHERE code = 'MY';
UPDATE countries SET currency_code = 'IDR' WHERE code = 'ID';
UPDATE countries SET currency_code = 'THB' WHERE code = 'TH';
UPDATE countries SET currency_code = 'PHP' WHERE code = 'PH';
UPDATE countries SET currency_code = 'INR' WHERE code = 'IN';
UPDATE countries SET currency_code = 'EUR' WHERE code IN ('DE', 'FR', 'IT', 'ES', 'NL', 'BE', 'AT', 'IE', 'PT', 'FI', 'LU', 'MT', 'CY', 'SK', 'SI', 'EE', 'LV', 'LT');
UPDATE countries SET currency_code = 'JPY' WHERE code = 'JP';
UPDATE countries SET currency_code = 'KRW' WHERE code = 'KR';
UPDATE countries SET currency_code = 'CNY' WHERE code = 'CN';
UPDATE countries SET currency_code = 'HKD' WHERE code = 'HK';
UPDATE countries SET currency_code = 'TWD' WHERE code = 'TW';
UPDATE countries SET currency_code = 'NZD' WHERE code = 'NZ';
UPDATE countries SET currency_code = 'CHF' WHERE code = 'CH';
UPDATE countries SET currency_code = 'SEK' WHERE code = 'SE';
UPDATE countries SET currency_code = 'NOK' WHERE code = 'NO';
UPDATE countries SET currency_code = 'DKK' WHERE code = 'DK';
UPDATE countries SET currency_code = 'PLN' WHERE code = 'PL';
UPDATE countries SET currency_code = 'CZK' WHERE code = 'CZ';
UPDATE countries SET currency_code = 'HUF' WHERE code = 'HU';
UPDATE countries SET currency_code = 'RON' WHERE code = 'RO';
UPDATE countries SET currency_code = 'BGN' WHERE code = 'BG';
UPDATE countries SET currency_code = 'HRK' WHERE code = 'HR';
UPDATE countries SET currency_code = 'RUB' WHERE code = 'RU';
UPDATE countries SET currency_code = 'UAH' WHERE code = 'UA';
UPDATE countries SET currency_code = 'TRY' WHERE code = 'TR';
UPDATE countries SET currency_code = 'ILS' WHERE code = 'IL';
UPDATE countries SET currency_code = 'SAR' WHERE code = 'SA';
UPDATE countries SET currency_code = 'AED' WHERE code = 'AE';
UPDATE countries SET currency_code = 'QAR' WHERE code = 'QA';
UPDATE countries SET currency_code = 'KWD' WHERE code = 'KW';
UPDATE countries SET currency_code = 'BHD' WHERE code = 'BH';
UPDATE countries SET currency_code = 'OMR' WHERE code = 'OM';
UPDATE countries SET currency_code = 'JOD' WHERE code = 'JO';
UPDATE countries SET currency_code = 'LBP' WHERE code = 'LB';
UPDATE countries SET currency_code = 'EGP' WHERE code = 'EG';
UPDATE countries SET currency_code = 'ZAR' WHERE code = 'ZA';
UPDATE countries SET currency_code = 'NGN' WHERE code = 'NG';
UPDATE countries SET currency_code = 'KES' WHERE code = 'KE';
UPDATE countries SET currency_code = 'GHS' WHERE code = 'GH';
UPDATE countries SET currency_code = 'MAD' WHERE code = 'MA';
UPDATE countries SET currency_code = 'TND' WHERE code = 'TN';
UPDATE countries SET currency_code = 'DZD' WHERE code = 'DZ';
UPDATE countries SET currency_code = 'BRL' WHERE code = 'BR';
UPDATE countries SET currency_code = 'ARS' WHERE code = 'AR';
UPDATE countries SET currency_code = 'CLP' WHERE code = 'CL';
UPDATE countries SET currency_code = 'COP' WHERE code = 'CO';
UPDATE countries SET currency_code = 'PEN' WHERE code = 'PE';
UPDATE countries SET currency_code = 'UYU' WHERE code = 'UY';
UPDATE countries SET currency_code = 'PYG' WHERE code = 'PY';
UPDATE countries SET currency_code = 'BOB' WHERE code = 'BO';
UPDATE countries SET currency_code = 'VES' WHERE code = 'VE';
UPDATE countries SET currency_code = 'MXN' WHERE code = 'MX';

-- Set default USD for countries without specific currency
UPDATE countries SET currency_code = 'USD' WHERE currency_code IS NULL;

-- Create function to get currency symbol
CREATE OR REPLACE FUNCTION get_currency_symbol(currency_code text)
RETURNS text AS $$
BEGIN
  RETURN CASE currency_code
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
    WHEN 'BHD' THEN 'BD'
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
    ELSE currency_code
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;