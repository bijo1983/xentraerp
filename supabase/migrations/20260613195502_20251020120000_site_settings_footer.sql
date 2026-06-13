/*
  # Site settings for global footer content

  - Create `site_settings` table for public site configuration values
  - Seed the `footer` record with defaults
  - Allow everyone to read settings; admins can update
*/

CREATE TABLE IF NOT EXISTS site_settings (
  slug text PRIMARY KEY,
  copyright_line text NOT NULL,
  powered_by_line text,
  powered_by_link text,
  contact_text text,
  contact_href text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION set_site_settings_audit()
RETURNS trigger AS $$
BEGIN
  IF tg_op = 'INSERT' THEN
    NEW.updated_at := COALESCE(NEW.updated_at, now());
  ELSE
    NEW.updated_at := now();
  END IF;

  IF auth.uid() IS NOT NULL THEN
    NEW.updated_by := auth.uid();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS set_site_settings_audit_trigger ON site_settings;
CREATE TRIGGER set_site_settings_audit_trigger
  BEFORE INSERT OR UPDATE ON site_settings
  FOR EACH ROW
  EXECUTE FUNCTION set_site_settings_audit();

DROP POLICY IF EXISTS "Public read site settings" ON site_settings;
CREATE POLICY "Public read site settings"
  ON site_settings
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admins update site settings" ON site_settings;
CREATE POLICY "Admins update site settings"
  ON site_settings
  FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()));

INSERT INTO site_settings (slug, copyright_line, powered_by_line, powered_by_link, contact_text, contact_href)
VALUES (
  'footer',
  '© 2025 Badminton Booking. All rights reserved.',
  'Powered by Innovegic Consultancy and IT Services Co W.L.L.',
  null,
  'info@innovegict.com',
  'mailto:info@innovegict.com'
)
ON CONFLICT (slug) DO UPDATE
SET
  copyright_line = EXCLUDED.copyright_line,
  powered_by_line = EXCLUDED.powered_by_line,
  powered_by_link = EXCLUDED.powered_by_link,
  contact_text = EXCLUDED.contact_text,
  contact_href = EXCLUDED.contact_href;
