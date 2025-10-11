/*
  # Password Reset Function for Local Development

  1. Purpose
    - Provide a way to reset user passwords directly in Supabase
    - Useful for local development when email reset isn't available
    - Secure function that updates auth.users table

  2. Usage
    - Call the function with user email and new password
    - Function will hash the password and update the user
    - Returns success/error message

  3. Security
    - Only works for existing users
    - Properly hashes passwords using Supabase's built-in functions
    - Logs the action for audit purposes
*/

-- Function to reset user password directly
CREATE OR REPLACE FUNCTION reset_user_password(
  user_email text,
  new_password text
)
RETURNS text AS $$
DECLARE
  auth_user_id uuid;
  result_message text;
BEGIN
  -- Get the auth user ID
  SELECT id INTO auth_user_id 
  FROM auth.users 
  WHERE email = user_email;
  
  IF auth_user_id IS NULL THEN
    RETURN format('❌ User not found: %s', user_email);
  END IF;
  
  -- Update the user's password
  -- Note: This uses Supabase's internal password hashing
  UPDATE auth.users 
  SET 
    encrypted_password = crypt(new_password, gen_salt('bf')),
    updated_at = now()
  WHERE id = auth_user_id;
  
  -- Log the action
  RAISE NOTICE 'Password reset for user: %', user_email;
  
  RETURN format('✅ Password successfully reset for: %s', user_email);
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN format('❌ Error resetting password for %s: %s', user_email, SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Example usage (commented out for safety):
-- SELECT reset_user_password('bijo_101@yahoo.co.in', 'newpassword123');

-- Function to check if user exists
CREATE OR REPLACE FUNCTION check_user_exists(user_email text)
RETURNS text AS $$
DECLARE
  auth_user_id uuid;
  user_created timestamptz;
  last_sign_in timestamptz;
BEGIN
  SELECT id, created_at, last_sign_in_at 
  INTO auth_user_id, user_created, last_sign_in
  FROM auth.users 
  WHERE email = user_email;
  
  IF auth_user_id IS NULL THEN
    RETURN format('❌ User not found: %s', user_email);
  END IF;
  
  RETURN format(
    '✅ User found: %s | ID: %s | Created: %s | Last login: %s',
    user_email,
    auth_user_id,
    user_created,
    COALESCE(last_sign_in::text, 'Never')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Clean up function (removes the reset function after use)
CREATE OR REPLACE FUNCTION cleanup_password_reset_functions()
RETURNS text AS $$
BEGIN
  DROP FUNCTION IF EXISTS reset_user_password(text, text);
  DROP FUNCTION IF EXISTS check_user_exists(text);
  DROP FUNCTION IF EXISTS cleanup_password_reset_functions();
  
  RETURN '✅ Password reset functions removed for security';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;