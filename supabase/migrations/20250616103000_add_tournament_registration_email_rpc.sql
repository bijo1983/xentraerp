-- Define RPC to send tournament registration confirmation emails
create or replace function public.send_tournament_registration_email(
  to_email text,
  player_name text,
  tournament_name text,
  event_label text,
  amount_due numeric,
  currency_code text,
  start_date date,
  end_date date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  webhook_url text := current_setting('app.tournament_registration_webhook', true);
  webhook_secret text := current_setting('app.tournament_registration_webhook_secret', true);
  http_response record;
  subject text := format('Tournament registration confirmed: %s', tournament_name);
  html_body text;
begin
  html_body := format(
    '<p>Hi %s,</p>' ||
    '<p>Your registration for <strong>%s</strong> (%s) is confirmed.</p>' ||
    '<p>Amount due: %s %s</p>' ||
    '<p>Schedule: %s - %s</p>' ||
    '<p>Thank you for registering!</p>',
    coalesce(player_name, to_email),
    tournament_name,
    event_label,
    coalesce(currency_code, 'USD'),
    coalesce(amount_due, 0),
    to_char(start_date, 'Mon DD, YYYY'),
    to_char(end_date, 'Mon DD, YYYY')
  );

  if webhook_url is null or webhook_url = '' then
    raise exception 'send_tournament_registration_email: app.tournament_registration_webhook is not configured';
  end if;

  begin
    select *
      into http_response
      from net.http_post(
        url := webhook_url,
        headers := jsonb_strip_nulls(
          jsonb_build_object('Content-Type', 'application/json') ||
          case
            when webhook_secret is null or webhook_secret = '' then '{}'::jsonb
            else jsonb_build_object('Authorization', 'Bearer ' || webhook_secret)
          end
        ),
        body := jsonb_build_object(
          'to', to_email,
          'subject', subject,
          'html', html_body,
          'player_name', player_name,
          'tournament_name', tournament_name,
          'event_label', event_label,
          'amount_due', amount_due,
          'currency_code', currency_code,
          'start_date', start_date,
          'end_date', end_date
        )
      );
  exception
    when undefined_function then
      raise exception 'send_tournament_registration_email: pg_net extension is not installed. Configure the Edge Function fallback or install the extension to enable direct delivery.';
  end;

  if http_response.status_code >= 400 then
    raise exception 'send_tournament_registration_email: webhook returned status % with body %',
      http_response.status_code,
      http_response.body;
  end if;
end;
$$;

comment on function public.send_tournament_registration_email(
  text,
  text,
  text,
  text,
  numeric,
  text,
  date,
  date
) is 'Relays tournament registration confirmations to an external webhook. Configure app.tournament_registration_webhook and app.tournament_registration_webhook_secret database settings.';
-- Allow client-side invocation
grant execute on function public.send_tournament_registration_email(
  text,
  text,
  text,
  text,
  numeric,
  text,
  date,
  date
) to anon, authenticated;
