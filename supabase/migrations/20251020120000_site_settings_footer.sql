/*
  # Site settings for global footer content

  - Create `site_settings` table to manage public site configuration values
  - Seed the `footer` record with default copyright and contact information
  - Allow everyone (including anonymous visitors) to read the settings
  - Allow administrators to update the settings while automatically tracking audit metadata
*/

create table if not exists site_settings (
  slug text primary key,
  copyright_line text not null,
  powered_by_line text,
  powered_by_link text,
  contact_text text,
  contact_href text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

alter table site_settings enable row level security;

create or replace function set_site_settings_audit()
returns trigger as $$
begin
  if tg_op = 'INSERT' then
    new.updated_at := coalesce(new.updated_at, now());
  else
    new.updated_at := now();
  end if;

  if auth.uid() is not null then
    new.updated_by := auth.uid();
  end if;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists set_site_settings_audit_trigger on site_settings;
create trigger set_site_settings_audit_trigger
  before insert or update on site_settings
  for each row
  execute function set_site_settings_audit();

create policy if not exists "Public read site settings"
  on site_settings
  for select
  using (true);

create policy if not exists "Admins update site settings"
  on site_settings
  for update
  to authenticated
  using (exists (select 1 from admin_users where user_id = auth.uid()))
  with check (exists (select 1 from admin_users where user_id = auth.uid()));

insert into site_settings (
  slug,
  copyright_line,
  powered_by_line,
  powered_by_link,
  contact_text,
  contact_href
)
values (
  'footer',
  '© 2025 Badminton Booking. All rights reserved.',
  'Powered by Innovegic Consultancy and IT Services Co W.L.L.',
  null,
  'info@innovegict.com',
  'mailto:info@innovegict.com'
)
on conflict (slug) do update
set
  copyright_line = excluded.copyright_line,
  powered_by_line = excluded.powered_by_line,
  powered_by_link = excluded.powered_by_link,
  contact_text = excluded.contact_text,
  contact_href = excluded.contact_href;
