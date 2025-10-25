create table if not exists public.tournament_pair_invitations (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  event_id uuid not null references public.tournament_events(id) on delete cascade,
  pair_id uuid not null references public.pairs(id) on delete cascade,
  inviter_id uuid not null references public.player_users(id) on delete cascade,
  invitee_id uuid not null references public.player_users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint tournament_pair_invitations_distinct_players check (inviter_id <> invitee_id)
);

create index if not exists tournament_pair_invitations_invitee_idx on public.tournament_pair_invitations(invitee_id);
create index if not exists tournament_pair_invitations_event_idx on public.tournament_pair_invitations(event_id);
create unique index if not exists tournament_pair_invitations_pending_unique
  on public.tournament_pair_invitations(event_id, pair_id, invitee_id)
  where status = 'pending';

alter table public.tournament_pair_invitations enable row level security;

drop policy if exists "Players view own pair invitations" on public.tournament_pair_invitations;
create policy "Players view own pair invitations" on public.tournament_pair_invitations
  for select
  using (
    invitee_id in (select id from public.player_users where user_id = auth.uid())
    or inviter_id in (select id from public.player_users where user_id = auth.uid())
    or exists (
      select 1
      from public.tournaments t
      where t.id = tournament_id
        and t.organizer_id = auth.uid()
    )
  );

drop policy if exists "Players send pair invitations" on public.tournament_pair_invitations;
create policy "Players send pair invitations" on public.tournament_pair_invitations
  for insert
  with check (
    inviter_id in (select id from public.player_users where user_id = auth.uid())
  );

drop policy if exists "Invitees respond to invitations" on public.tournament_pair_invitations;
create policy "Invitees respond to invitations" on public.tournament_pair_invitations
  for update
  using (
    invitee_id in (select id from public.player_users where user_id = auth.uid())
    or inviter_id in (select id from public.player_users where user_id = auth.uid())
    or exists (
      select 1
      from public.tournaments t
      where t.id = tournament_id
        and t.organizer_id = auth.uid()
    )
  )
  with check (
    invitee_id in (select id from public.player_users where user_id = auth.uid())
    or inviter_id in (select id from public.player_users where user_id = auth.uid())
    or exists (
      select 1
      from public.tournaments t
      where t.id = tournament_id
        and t.organizer_id = auth.uid()
    )
  );

drop policy if exists "Manage pair invitations" on public.tournament_pair_invitations;
create policy "Manage pair invitations" on public.tournament_pair_invitations
  for delete
  using (
    invitee_id in (select id from public.player_users where user_id = auth.uid())
    or inviter_id in (select id from public.player_users where user_id = auth.uid())
    or exists (
      select 1
      from public.tournaments t
      where t.id = tournament_id
        and t.organizer_id = auth.uid()
    )
  );
