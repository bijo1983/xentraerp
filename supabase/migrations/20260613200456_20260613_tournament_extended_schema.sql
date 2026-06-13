/*
  # Tournament Extended Schema

  Adds all tables required by the tournament management frontend that are not yet
  in the database. This migration is fully idempotent.

  ## New Tables

  ### Lookup Tables
  - `event_types` – configurable list of event type labels (Singles, Doubles, etc.)
  - `age_groups` – configurable age-group labels (Open, U18, U21, etc.)
  - `skill_levels` – configurable skill-level labels (Beginner, Intermediate, etc.)

  ### Tournament Tables
  - `tournament_events` – categories/events within a tournament (e.g. Men's Singles Open)
  - `pairs` – doubles partner pairs linking two player_users
  - `event_entries` – player or pair registration in a tournament_event
  - `draws` – bracket/draw record per event (stores bracket_data as JSON)
  - `matches` – individual matches within a draw (singles or doubles)

  ## Modified Tables
  - `tournaments` – adds `currency_code` column

  ## Security
  - RLS enabled on every new table with appropriate policies
*/

-- ─────────────────────────────────────────────
-- Lookup tables
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS event_types (
  name text PRIMARY KEY
);

INSERT INTO event_types (name) VALUES
  ('Singles'), ('Doubles'), ('Mixed Doubles')
ON CONFLICT DO NOTHING;

ALTER TABLE event_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read event types" ON event_types;
CREATE POLICY "Anyone can read event types"
  ON event_types FOR SELECT
  TO authenticated, anon
  USING (true);

DROP POLICY IF EXISTS "Organizers can manage event types" ON event_types;
CREATE POLICY "Organizers can manage event types"
  ON event_types FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Organizers can delete event types" ON event_types;
CREATE POLICY "Organizers can delete event types"
  ON event_types FOR DELETE
  TO authenticated
  USING (true);

-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS age_groups (
  name text PRIMARY KEY
);

INSERT INTO age_groups (name) VALUES
  ('Open'), ('U21'), ('U18'), ('U15'), ('U13'), ('Senior (40+)')
ON CONFLICT DO NOTHING;

ALTER TABLE age_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read age groups" ON age_groups;
CREATE POLICY "Anyone can read age groups"
  ON age_groups FOR SELECT
  TO authenticated, anon
  USING (true);

DROP POLICY IF EXISTS "Organizers can manage age groups" ON age_groups;
CREATE POLICY "Organizers can manage age groups"
  ON age_groups FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Organizers can delete age groups" ON age_groups;
CREATE POLICY "Organizers can delete age groups"
  ON age_groups FOR DELETE
  TO authenticated
  USING (true);

-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS skill_levels (
  name text PRIMARY KEY
);

INSERT INTO skill_levels (name) VALUES
  ('Beginner'), ('Intermediate'), ('Advanced'), ('Elite')
ON CONFLICT DO NOTHING;

ALTER TABLE skill_levels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read skill levels" ON skill_levels;
CREATE POLICY "Anyone can read skill levels"
  ON skill_levels FOR SELECT
  TO authenticated, anon
  USING (true);

DROP POLICY IF EXISTS "Organizers can manage skill levels" ON skill_levels;
CREATE POLICY "Organizers can manage skill levels"
  ON skill_levels FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Organizers can delete skill levels" ON skill_levels;
CREATE POLICY "Organizers can delete skill levels"
  ON skill_levels FOR DELETE
  TO authenticated
  USING (true);

-- ─────────────────────────────────────────────
-- currency_code on tournaments
-- ─────────────────────────────────────────────

ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS currency_code text;

-- ─────────────────────────────────────────────
-- tournament_events
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tournament_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id   uuid NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  event_type      text NOT NULL,
  age_group       text,
  gender          text CHECK (gender IN ('M', 'F', 'X', NULL)),
  skill_level     text,
  registration_fee numeric(10,2),
  max_entries     integer,
  created_at      timestamptz DEFAULT now(),
  UNIQUE (tournament_id, event_type, age_group, gender, skill_level)
);

CREATE INDEX IF NOT EXISTS idx_tournament_events_tournament_id ON tournament_events(tournament_id);

ALTER TABLE tournament_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view tournament events" ON tournament_events;
CREATE POLICY "Anyone can view tournament events"
  ON tournament_events FOR SELECT
  TO authenticated, anon
  USING (true);

DROP POLICY IF EXISTS "Tournament hosts can manage events" ON tournament_events;
CREATE POLICY "Tournament hosts can manage events"
  ON tournament_events FOR INSERT
  TO authenticated
  WITH CHECK (
    tournament_id IN (
      SELECT id FROM tournaments WHERE
        (hosted_by = 'club' AND organizer_id IN (SELECT id FROM club_users WHERE user_id = auth.uid())) OR
        (hosted_by = 'organizer' AND organizer_id IN (SELECT id FROM organizer_users WHERE user_id = auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Tournament hosts can update events" ON tournament_events;
CREATE POLICY "Tournament hosts can update events"
  ON tournament_events FOR UPDATE
  TO authenticated
  USING (
    tournament_id IN (
      SELECT id FROM tournaments WHERE
        (hosted_by = 'club' AND organizer_id IN (SELECT id FROM club_users WHERE user_id = auth.uid())) OR
        (hosted_by = 'organizer' AND organizer_id IN (SELECT id FROM organizer_users WHERE user_id = auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Tournament hosts can delete events" ON tournament_events;
CREATE POLICY "Tournament hosts can delete events"
  ON tournament_events FOR DELETE
  TO authenticated
  USING (
    tournament_id IN (
      SELECT id FROM tournaments WHERE
        (hosted_by = 'club' AND organizer_id IN (SELECT id FROM club_users WHERE user_id = auth.uid())) OR
        (hosted_by = 'organizer' AND organizer_id IN (SELECT id FROM organizer_users WHERE user_id = auth.uid()))
    )
  );

-- ─────────────────────────────────────────────
-- pairs
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pairs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player1_id  uuid NOT NULL REFERENCES player_users(id) ON DELETE CASCADE,
  player2_id  uuid NOT NULL REFERENCES player_users(id) ON DELETE CASCADE,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (player1_id, player2_id),
  CONSTRAINT pairs_distinct_players CHECK (player1_id <> player2_id)
);

CREATE INDEX IF NOT EXISTS idx_pairs_player1_id ON pairs(player1_id);
CREATE INDEX IF NOT EXISTS idx_pairs_player2_id ON pairs(player2_id);

ALTER TABLE pairs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Players can view pairs they are in" ON pairs;
CREATE POLICY "Players can view pairs they are in"
  ON pairs FOR SELECT
  TO authenticated
  USING (
    player1_id IN (SELECT id FROM player_users WHERE user_id = auth.uid())
    OR player2_id IN (SELECT id FROM player_users WHERE user_id = auth.uid())
    OR true  -- pairs are generally visible for tournament display
  );

DROP POLICY IF EXISTS "Players can create pairs" ON pairs;
CREATE POLICY "Players can create pairs"
  ON pairs FOR INSERT
  TO authenticated
  WITH CHECK (
    player1_id IN (SELECT id FROM player_users WHERE user_id = auth.uid())
    OR player2_id IN (SELECT id FROM player_users WHERE user_id = auth.uid())
  );

-- ─────────────────────────────────────────────
-- event_entries
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS event_entries (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      uuid NOT NULL REFERENCES tournament_events(id) ON DELETE CASCADE,
  player_id     uuid REFERENCES player_users(id) ON DELETE CASCADE,
  pair_id       uuid REFERENCES pairs(id) ON DELETE CASCADE,
  entry_status  text NOT NULL DEFAULT 'pending'
    CHECK (entry_status IN (
      'pending', 'accepted', 'confirmed', 'checked_in',
      'waitlisted', 'cancelled', 'withdrawn', 'completed', 'disqualified'
    )),
  created_at    timestamptz DEFAULT now(),
  CONSTRAINT event_entries_player_or_pair CHECK (
    (player_id IS NOT NULL AND pair_id IS NULL)
    OR (player_id IS NULL AND pair_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_event_entries_event_id ON event_entries(event_id);
CREATE INDEX IF NOT EXISTS idx_event_entries_player_id ON event_entries(player_id);
CREATE INDEX IF NOT EXISTS idx_event_entries_pair_id ON event_entries(pair_id);

ALTER TABLE event_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view event entries" ON event_entries;
CREATE POLICY "Anyone can view event entries"
  ON event_entries FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Players can register for events" ON event_entries;
CREATE POLICY "Players can register for events"
  ON event_entries FOR INSERT
  TO authenticated
  WITH CHECK (
    player_id IN (SELECT id FROM player_users WHERE user_id = auth.uid())
    OR pair_id IN (
      SELECT id FROM pairs WHERE
        player1_id IN (SELECT id FROM player_users WHERE user_id = auth.uid())
        OR player2_id IN (SELECT id FROM player_users WHERE user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Players can update own entries" ON event_entries;
CREATE POLICY "Players can update own entries"
  ON event_entries FOR UPDATE
  TO authenticated
  USING (
    player_id IN (SELECT id FROM player_users WHERE user_id = auth.uid())
    OR pair_id IN (
      SELECT id FROM pairs WHERE
        player1_id IN (SELECT id FROM player_users WHERE user_id = auth.uid())
        OR player2_id IN (SELECT id FROM player_users WHERE user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Tournament hosts can manage all entries" ON event_entries;
CREATE POLICY "Tournament hosts can manage all entries"
  ON event_entries FOR ALL
  TO authenticated
  USING (
    event_id IN (
      SELECT te.id FROM tournament_events te
      JOIN tournaments t ON t.id = te.tournament_id
      WHERE
        (t.hosted_by = 'club' AND t.organizer_id IN (SELECT id FROM club_users WHERE user_id = auth.uid())) OR
        (t.hosted_by = 'organizer' AND t.organizer_id IN (SELECT id FROM organizer_users WHERE user_id = auth.uid()))
    )
  )
  WITH CHECK (
    event_id IN (
      SELECT te.id FROM tournament_events te
      JOIN tournaments t ON t.id = te.tournament_id
      WHERE
        (t.hosted_by = 'club' AND t.organizer_id IN (SELECT id FROM club_users WHERE user_id = auth.uid())) OR
        (t.hosted_by = 'organizer' AND t.organizer_id IN (SELECT id FROM organizer_users WHERE user_id = auth.uid()))
    )
  );

-- ─────────────────────────────────────────────
-- draws
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS draws (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      uuid NOT NULL REFERENCES tournament_events(id) ON DELETE CASCADE,
  type          text NOT NULL DEFAULT 'single_elimination',
  bracket_data  jsonb,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_draws_event_id ON draws(event_id);

ALTER TABLE draws ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view draws" ON draws;
CREATE POLICY "Anyone can view draws"
  ON draws FOR SELECT
  TO authenticated, anon
  USING (true);

DROP POLICY IF EXISTS "Tournament hosts can manage draws" ON draws;
CREATE POLICY "Tournament hosts can manage draws"
  ON draws FOR ALL
  TO authenticated
  USING (
    event_id IN (
      SELECT te.id FROM tournament_events te
      JOIN tournaments t ON t.id = te.tournament_id
      WHERE
        (t.hosted_by = 'club' AND t.organizer_id IN (SELECT id FROM club_users WHERE user_id = auth.uid())) OR
        (t.hosted_by = 'organizer' AND t.organizer_id IN (SELECT id FROM organizer_users WHERE user_id = auth.uid()))
    )
  )
  WITH CHECK (
    event_id IN (
      SELECT te.id FROM tournament_events te
      JOIN tournaments t ON t.id = te.tournament_id
      WHERE
        (t.hosted_by = 'club' AND t.organizer_id IN (SELECT id FROM club_users WHERE user_id = auth.uid())) OR
        (t.hosted_by = 'organizer' AND t.organizer_id IN (SELECT id FROM organizer_users WHERE user_id = auth.uid()))
    )
  );

-- ─────────────────────────────────────────────
-- matches (new event-based table)
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS matches (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draw_id         uuid NOT NULL REFERENCES draws(id) ON DELETE CASCADE,
  round           integer NOT NULL DEFAULT 1,
  status          text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
  scheduled_time  timestamptz,
  court_id        uuid REFERENCES courts(id),
  player1_id      uuid REFERENCES player_users(id),
  player2_id      uuid REFERENCES player_users(id),
  pair1_id        uuid REFERENCES pairs(id),
  pair2_id        uuid REFERENCES pairs(id),
  result_data     jsonb,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_matches_draw_id ON matches(draw_id);
CREATE INDEX IF NOT EXISTS idx_matches_player1_id ON matches(player1_id);
CREATE INDEX IF NOT EXISTS idx_matches_player2_id ON matches(player2_id);

ALTER TABLE matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view matches" ON matches;
CREATE POLICY "Anyone can view matches"
  ON matches FOR SELECT
  TO authenticated, anon
  USING (true);

DROP POLICY IF EXISTS "Tournament hosts can manage matches in draws" ON matches;
CREATE POLICY "Tournament hosts can manage matches in draws"
  ON matches FOR ALL
  TO authenticated
  USING (
    draw_id IN (
      SELECT d.id FROM draws d
      JOIN tournament_events te ON te.id = d.event_id
      JOIN tournaments t ON t.id = te.tournament_id
      WHERE
        (t.hosted_by = 'club' AND t.organizer_id IN (SELECT id FROM club_users WHERE user_id = auth.uid())) OR
        (t.hosted_by = 'organizer' AND t.organizer_id IN (SELECT id FROM organizer_users WHERE user_id = auth.uid()))
    )
  )
  WITH CHECK (
    draw_id IN (
      SELECT d.id FROM draws d
      JOIN tournament_events te ON te.id = d.event_id
      JOIN tournaments t ON t.id = te.tournament_id
      WHERE
        (t.hosted_by = 'club' AND t.organizer_id IN (SELECT id FROM club_users WHERE user_id = auth.uid())) OR
        (t.hosted_by = 'organizer' AND t.organizer_id IN (SELECT id FROM organizer_users WHERE user_id = auth.uid()))
    )
  );

-- ─────────────────────────────────────────────
-- tournament_pair_invitations (depends on pairs + tournament_events)
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tournament_pair_invitations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  event_id      uuid NOT NULL REFERENCES tournament_events(id) ON DELETE CASCADE,
  pair_id       uuid NOT NULL REFERENCES pairs(id) ON DELETE CASCADE,
  inviter_id    uuid NOT NULL REFERENCES player_users(id) ON DELETE CASCADE,
  invitee_id    uuid NOT NULL REFERENCES player_users(id) ON DELETE CASCADE,
  status        text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  responded_at  timestamptz,
  CONSTRAINT tournament_pair_invitations_distinct_players CHECK (inviter_id <> invitee_id)
);

CREATE INDEX IF NOT EXISTS tournament_pair_invitations_invitee_idx ON tournament_pair_invitations(invitee_id);
CREATE INDEX IF NOT EXISTS tournament_pair_invitations_event_idx ON tournament_pair_invitations(event_id);
CREATE UNIQUE INDEX IF NOT EXISTS tournament_pair_invitations_pending_unique
  ON tournament_pair_invitations(event_id, pair_id, invitee_id)
  WHERE status = 'pending';

ALTER TABLE tournament_pair_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Players view own pair invitations" ON tournament_pair_invitations;
CREATE POLICY "Players view own pair invitations"
  ON tournament_pair_invitations FOR SELECT
  USING (
    invitee_id IN (SELECT id FROM player_users WHERE user_id = auth.uid())
    OR inviter_id IN (SELECT id FROM player_users WHERE user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM tournaments t
      WHERE t.id = tournament_id AND t.organizer_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Players send pair invitations" ON tournament_pair_invitations;
CREATE POLICY "Players send pair invitations"
  ON tournament_pair_invitations FOR INSERT
  WITH CHECK (
    inviter_id IN (SELECT id FROM player_users WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Invitees respond to invitations" ON tournament_pair_invitations;
CREATE POLICY "Invitees respond to invitations"
  ON tournament_pair_invitations FOR UPDATE
  USING (
    invitee_id IN (SELECT id FROM player_users WHERE user_id = auth.uid())
    OR inviter_id IN (SELECT id FROM player_users WHERE user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM tournaments t
      WHERE t.id = tournament_id AND t.organizer_id = auth.uid()
    )
  )
  WITH CHECK (
    invitee_id IN (SELECT id FROM player_users WHERE user_id = auth.uid())
    OR inviter_id IN (SELECT id FROM player_users WHERE user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM tournaments t
      WHERE t.id = tournament_id AND t.organizer_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Manage pair invitations" ON tournament_pair_invitations;
CREATE POLICY "Manage pair invitations"
  ON tournament_pair_invitations FOR DELETE
  USING (
    invitee_id IN (SELECT id FROM player_users WHERE user_id = auth.uid())
    OR inviter_id IN (SELECT id FROM player_users WHERE user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM tournaments t
      WHERE t.id = tournament_id AND t.organizer_id = auth.uid()
    )
  );
