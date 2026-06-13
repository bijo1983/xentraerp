/*
  # Tournament RPC Functions

  Stored procedures required by src/lib/tournament.ts and frontend components:

  - `list_tournament_events(p_tournament_id)` – returns all events for a tournament
  - `upsert_tournament_event(...)` – insert or update a tournament event by natural key
  - `seed_tournament_event_presets(p_tournament_id)` – seeds default event presets
  - `list_tournament_matches(p_tournament_id)` – returns all matches for a tournament
  - `update_match_score(p_match_id, p_score_a, p_score_b, p_winner_id)` – records a result
*/

-- ─────────────────────────────────────────────
-- list_tournament_events
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION list_tournament_events(p_tournament_id uuid)
RETURNS TABLE (
  id              uuid,
  tournament_id   uuid,
  event_type      text,
  age_group       text,
  gender          text,
  skill_level     text,
  registration_fee numeric,
  max_entries     integer,
  created_at      timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    te.id, te.tournament_id, te.event_type, te.age_group,
    te.gender, te.skill_level, te.registration_fee, te.max_entries, te.created_at
  FROM tournament_events te
  WHERE te.tournament_id = p_tournament_id
  ORDER BY te.event_type, te.age_group NULLS LAST, te.gender NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION list_tournament_events(uuid) TO authenticated, anon;

-- ─────────────────────────────────────────────
-- upsert_tournament_event
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION upsert_tournament_event(
  p_tournament_id   uuid,
  p_event_type      text,
  p_age_group       text DEFAULT NULL,
  p_gender          text DEFAULT NULL,
  p_skill_level     text DEFAULT NULL,
  p_registration_fee numeric DEFAULT NULL,
  p_max_entries     integer DEFAULT NULL
)
RETURNS TABLE (
  id              uuid,
  tournament_id   uuid,
  event_type      text,
  age_group       text,
  gender          text,
  skill_level     text,
  registration_fee numeric,
  max_entries     integer,
  created_at      timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO tournament_events (
    tournament_id, event_type, age_group, gender, skill_level, registration_fee, max_entries
  )
  VALUES (
    p_tournament_id, p_event_type, p_age_group, p_gender, p_skill_level,
    p_registration_fee, p_max_entries
  )
  ON CONFLICT (tournament_id, event_type, age_group, gender, skill_level)
  DO UPDATE SET
    registration_fee = COALESCE(EXCLUDED.registration_fee, tournament_events.registration_fee),
    max_entries      = COALESCE(EXCLUDED.max_entries, tournament_events.max_entries)
  RETURNING id INTO v_id;

  RETURN QUERY
  SELECT
    te.id, te.tournament_id, te.event_type, te.age_group,
    te.gender, te.skill_level, te.registration_fee, te.max_entries, te.created_at
  FROM tournament_events te
  WHERE te.id = v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION upsert_tournament_event(uuid, text, text, text, text, numeric, integer) TO authenticated;

-- ─────────────────────────────────────────────
-- seed_tournament_event_presets
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION seed_tournament_event_presets(p_tournament_id uuid)
RETURNS TABLE (
  id              uuid,
  tournament_id   uuid,
  event_type      text,
  age_group       text,
  gender          text,
  skill_level     text,
  registration_fee numeric,
  max_entries     integer,
  created_at      timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insert common presets (idempotent via ON CONFLICT)
  INSERT INTO tournament_events (tournament_id, event_type, age_group, gender, skill_level)
  VALUES
    (p_tournament_id, 'Singles', 'Open', 'M', NULL),
    (p_tournament_id, 'Singles', 'Open', 'F', NULL),
    (p_tournament_id, 'Doubles', 'Open', 'M', NULL),
    (p_tournament_id, 'Doubles', 'Open', 'F', NULL),
    (p_tournament_id, 'Mixed Doubles', 'Open', 'X', NULL)
  ON CONFLICT (tournament_id, event_type, age_group, gender, skill_level) DO NOTHING;

  RETURN QUERY
  SELECT
    te.id, te.tournament_id, te.event_type, te.age_group,
    te.gender, te.skill_level, te.registration_fee, te.max_entries, te.created_at
  FROM tournament_events te
  WHERE te.tournament_id = p_tournament_id
  ORDER BY te.event_type, te.gender;
END;
$$;

GRANT EXECUTE ON FUNCTION seed_tournament_event_presets(uuid) TO authenticated;

-- ─────────────────────────────────────────────
-- list_tournament_matches
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION list_tournament_matches(p_tournament_id uuid)
RETURNS TABLE (
  id              uuid,
  tournament_id   uuid,
  round_number    integer,
  match_number    integer,
  player_1_id     uuid,
  player_2_id     uuid,
  scheduled_on    timestamptz,
  court_id        uuid,
  winner_id       uuid,
  player_1_score  integer,
  player_2_score  integer,
  match_status    text,
  created_at      timestamptz,
  updated_at      timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  -- Support both the legacy tournament_matches table and the new matches table
  -- Returns from tournament_matches (legacy, existing table)
  RETURN QUERY
  SELECT
    tm.id,
    tm.tournament_id,
    tm.round_number,
    tm.match_number,
    tm.player_1_id,
    tm.player_2_id,
    tm.scheduled_on,
    tm.court_id,
    tm.winner_id,
    tm.player_1_score,
    tm.player_2_score,
    tm.match_status,
    tm.created_at,
    tm.updated_at
  FROM tournament_matches tm
  WHERE tm.tournament_id = p_tournament_id
  ORDER BY tm.round_number, tm.match_number;
END;
$$;

GRANT EXECUTE ON FUNCTION list_tournament_matches(uuid) TO authenticated, anon;

-- ─────────────────────────────────────────────
-- update_match_score
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_match_score(
  p_match_id  uuid,
  p_score_a   integer,
  p_score_b   integer,
  p_winner_id uuid
)
RETURNS TABLE (
  id              uuid,
  tournament_id   uuid,
  round_number    integer,
  match_number    integer,
  player_1_id     uuid,
  player_2_id     uuid,
  scheduled_on    timestamptz,
  court_id        uuid,
  winner_id       uuid,
  player_1_score  integer,
  player_2_score  integer,
  match_status    text,
  created_at      timestamptz,
  updated_at      timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE tournament_matches
  SET
    player_1_score = p_score_a,
    player_2_score = p_score_b,
    winner_id      = p_winner_id,
    match_status   = 'completed',
    updated_at     = now()
  WHERE id = p_match_id;

  RETURN QUERY
  SELECT
    tm.id, tm.tournament_id, tm.round_number, tm.match_number,
    tm.player_1_id, tm.player_2_id, tm.scheduled_on, tm.court_id,
    tm.winner_id, tm.player_1_score, tm.player_2_score, tm.match_status,
    tm.created_at, tm.updated_at
  FROM tournament_matches tm
  WHERE tm.id = p_match_id;
END;
$$;

GRANT EXECUTE ON FUNCTION update_match_score(uuid, integer, integer, uuid) TO authenticated;
