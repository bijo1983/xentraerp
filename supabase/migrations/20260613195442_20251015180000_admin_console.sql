/*
  # Admin console support for club & organizer management

  1. Schema changes
    - Add approval_status, is_visible, and payment_status columns to club_users and organizer_users
    - Backfill existing records to remain visible/approved

  2. Security & automation
    - Allow administrators to manage club & organizer profiles
    - Prevent non-admins from changing admin-managed fields via triggers

  3. Seed
    - Provision bijo.mammen@innovegicit.com as an administrator if auth user exists
*/

ALTER TABLE club_users
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'pending'
    CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS is_visible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid', 'paid', 'overdue'));

ALTER TABLE organizer_users
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'pending'
    CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS is_visible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid', 'paid', 'overdue'));

UPDATE club_users
SET approval_status = 'approved', is_visible = true
WHERE created_at < now();

UPDATE organizer_users
SET approval_status = 'approved', is_visible = true
WHERE created_at < now();

CREATE INDEX IF NOT EXISTS idx_club_users_approval_status ON club_users(approval_status);
CREATE INDEX IF NOT EXISTS idx_club_users_is_visible ON club_users(is_visible);
CREATE INDEX IF NOT EXISTS idx_club_users_payment_status ON club_users(payment_status);
CREATE INDEX IF NOT EXISTS idx_organizer_users_approval_status ON organizer_users(approval_status);
CREATE INDEX IF NOT EXISTS idx_organizer_users_is_visible ON organizer_users(is_visible);
CREATE INDEX IF NOT EXISTS idx_organizer_users_payment_status ON organizer_users(payment_status);

CREATE OR REPLACE FUNCTION enforce_admin_managed_profile_fields()
RETURNS trigger AS $$
DECLARE
  is_admin boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM admin_users au WHERE au.user_id = auth.uid()
  ) INTO is_admin;

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

DROP POLICY IF EXISTS "Admins can manage club profiles" ON club_users;
CREATE POLICY "Admins can manage club profiles"
  ON club_users FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Admins can update club profiles" ON club_users;
CREATE POLICY "Admins can update club profiles"
  ON club_users FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Admins can manage organizer profiles" ON organizer_users;
CREATE POLICY "Admins can manage organizer profiles"
  ON organizer_users FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Admins can update organizer profiles" ON organizer_users;
CREATE POLICY "Admins can update organizer profiles"
  ON organizer_users FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()));

DO $$
DECLARE
  target_email text := 'bijo.mammen@innovegicit.com';
  admin_user_id uuid;
  admin_account_id uuid;
  admin_profile_id uuid;
  derived_name text;
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

  SELECT id INTO admin_profile_id FROM profiles WHERE lower(name) = 'administrator' LIMIT 1;

  IF admin_profile_id IS NULL THEN
    INSERT INTO profiles (name, description)
    VALUES ('Administrator', 'Platform administrator with full access')
    ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description
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

  UPDATE auth.users
  SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb)
        || jsonb_build_object('profile_type', 'Administrator')
  WHERE id = admin_user_id;

  IF to_regprocedure('public.sync_auth_user_profile(uuid, text, uuid)') IS NOT NULL THEN
    PERFORM sync_auth_user_profile(admin_user_id, 'Administrator', admin_account_id);
  END IF;
END;
$$;
