/*
  # Admin console support for club & organizer management

  1. Schema changes
    - Add approval_status, is_visible, and payment_status columns to club_users and organizer_users
    - Backfill existing records to remain visible/approved

  2. Security & automation
    - Allow administrators (admin_users) to read/update all club & organizer profiles
    - Prevent non-admins from changing admin-managed fields via triggers

  3. Seed
    - Ensure bijo.mammen@innovegicit.com is provisioned as an administrator with default password
*/

-- Add admin-managed lifecycle columns to club profiles
ALTER TABLE club_users
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'pending'
    CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS is_visible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid', 'paid', 'overdue'));

-- Add admin-managed lifecycle columns to organizer profiles
ALTER TABLE organizer_users
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'pending'
    CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS is_visible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid', 'paid', 'overdue'));

-- Keep existing data accessible after introducing stricter defaults
UPDATE club_users
SET approval_status = 'approved',
    is_visible = true
WHERE created_at < now();

UPDATE organizer_users
SET approval_status = 'approved',
    is_visible = true
WHERE created_at < now();

-- Helpful indexes for new workflow filters
CREATE INDEX IF NOT EXISTS idx_club_users_approval_status ON club_users(approval_status);
CREATE INDEX IF NOT EXISTS idx_club_users_is_visible ON club_users(is_visible);
CREATE INDEX IF NOT EXISTS idx_club_users_payment_status ON club_users(payment_status);

CREATE INDEX IF NOT EXISTS idx_organizer_users_approval_status ON organizer_users(approval_status);
CREATE INDEX IF NOT EXISTS idx_organizer_users_is_visible ON organizer_users(is_visible);
CREATE INDEX IF NOT EXISTS idx_organizer_users_payment_status ON organizer_users(payment_status);

-- Trigger function to ensure only admins can change approval/payment/visibility fields
CREATE OR REPLACE FUNCTION enforce_admin_managed_profile_fields()
RETURNS trigger AS $$
DECLARE
  is_admin boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM admin_users au
    WHERE au.user_id = auth.uid()
  )
  INTO is_admin;

  -- Allow administrators to manage lifecycle fields freely
  IF is_admin THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.approval_status := 'pending';
    NEW.is_visible := false;
    NEW.payment_status := 'unpaid';
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.approval_status := OLD.approval_status;
    NEW.is_visible := OLD.is_visible;
    NEW.payment_status := OLD.payment_status;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach triggers to both profile tables
DROP TRIGGER IF EXISTS enforce_admin_fields_on_club_users ON club_users;
CREATE TRIGGER enforce_admin_fields_on_club_users
  BEFORE INSERT OR UPDATE ON club_users
  FOR EACH ROW
  EXECUTE FUNCTION enforce_admin_managed_profile_fields();

DROP TRIGGER IF EXISTS enforce_admin_fields_on_organizer_users ON organizer_users;
CREATE TRIGGER enforce_admin_fields_on_organizer_users
  BEFORE INSERT OR UPDATE ON organizer_users
  FOR EACH ROW
  EXECUTE FUNCTION enforce_admin_managed_profile_fields();

-- Allow administrators to manage club profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'club_users'
      AND policyname = 'Admins can manage club profiles'
  ) THEN
    CREATE POLICY "Admins can manage club profiles"
      ON club_users FOR SELECT
      TO authenticated
      USING (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()));

    CREATE POLICY "Admins can update club profiles"
      ON club_users FOR UPDATE
      TO authenticated
      USING (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()))
      WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()));
  END IF;
END;
$$;

-- Allow administrators to manage organizer profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'organizer_users'
      AND policyname = 'Admins can manage organizer profiles'
  ) THEN
    CREATE POLICY "Admins can manage organizer profiles"
      ON organizer_users FOR SELECT
      TO authenticated
      USING (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()));

    CREATE POLICY "Admins can update organizer profiles"
      ON organizer_users FOR UPDATE
      TO authenticated
      USING (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()))
      WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()));
  END IF;
END;
$$;

-- Provision bijo.mammen@innovegicit.com as an administrator with a default password
DO $$
DECLARE
  target_email text := 'bijo.mammen@innovegicit.com';
  admin_user_id uuid;
  admin_account_id uuid;
  admin_profile_id uuid;
  derived_name text;
  has_password_function boolean;
BEGIN
  SELECT id, COALESCE(raw_user_meta_data->>'name', split_part(email, '@', 1))
  INTO admin_user_id, derived_name
  FROM auth.users
  WHERE lower(email) = lower(target_email)
  LIMIT 1;

  IF admin_user_id IS NULL THEN
    RAISE NOTICE 'No auth user found for %; please create the auth.users account first.', target_email;
    RETURN;
  END IF;

  SELECT id
  INTO admin_profile_id
  FROM profiles
  WHERE lower(name) = 'administrator'
  LIMIT 1;

  IF admin_profile_id IS NULL THEN
    INSERT INTO profiles (name, description)
    VALUES ('Administrator', 'Platform administrator with full access')
    ON CONFLICT (name) DO UPDATE
      SET description = EXCLUDED.description
    RETURNING id INTO admin_profile_id;
  END IF;

  INSERT INTO admin_users (user_id, full_name, email, profile_id)
  VALUES (admin_user_id, derived_name, lower(target_email), admin_profile_id)
  ON CONFLICT (user_id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        email = EXCLUDED.email,
        profile_id = EXCLUDED.profile_id,
        updated_at = now()
  RETURNING id INTO admin_account_id;

  -- Persist profile type metadata on auth.users
  UPDATE auth.users
  SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb)
        || jsonb_build_object('profile_type', 'Administrator')
  WHERE id = admin_user_id;

  -- Sync auth_user_profiles helper table if available
  IF to_regprocedure('public.sync_auth_user_profile(uuid, text, uuid)') IS NOT NULL THEN
    PERFORM sync_auth_user_profile(admin_user_id, 'Administrator', admin_account_id);
  END IF;

  -- Set default password if helper function exists
  SELECT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'auth'
      AND p.proname = 'set_auth_user_password'
  ) INTO has_password_function;

  IF has_password_function THEN
    PERFORM auth.set_auth_user_password(admin_user_id, 'P@ssword');
  ELSE
    RAISE NOTICE 'auth.set_auth_user_password is unavailable; set password for % manually.', target_email;
  END IF;
END;
$$;
