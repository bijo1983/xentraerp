// ======================================================================
// FILE: src/lib/tournament.ts
// Purpose: Centralized tournament data-access for UI components.
// Depends on: src/lib/supabaseClient.ts exporting `supabase`.
// ======================================================================
import { supabase } from './supabaseClient';

export type Tournament = {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  status: 'upcoming' | 'registration_open' | 'ongoing' | 'completed' | 'cancelled';
  description?: string | null;
};

export type TournamentEvent = {
  id: string;
  tournament_id: string;
  event_type: string;     // 'Singles' | 'Doubles' | custom
  age_group: string | null;
  gender: string | null;  // 'M' | 'F' | 'X' | null
  skill_level: string | null;
  registration_fee: number | null;
  max_entries: number | null;
  created_at?: string;
};

export type TournamentMatch = {
  id: string;
  tournament_id: string;
  round_number: number;
  match_number: number;
  player_1_id: string | null;
  player_2_id: string | null;
  scheduled_on: string | null;
  court_id: string | null;
  winner_id: string | null;
  player_1_score: number | null;
  player_2_score: number | null;
  match_status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  created_at?: string;
  updated_at?: string;
};

/** Tournaments list */
export async function listTournaments(): Promise<Tournament[]> {
  const { data, error } = await supabase
    .from('tournaments')
    .select('id,name,start_date,end_date,status,description')
    .order('start_date', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Tournament[];
}

/** Single tournament by id */
export async function getTournament(id: string): Promise<Tournament> {
  const { data, error } = await supabase
    .from('tournaments')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw new Error(error.message);
  return data as Tournament;
}

/** Update tournament row (pass partial with id) */
export async function updateTournament(model: Partial<Tournament> & { id: string }) {
  const { error } = await supabase.from('tournaments').update(model).eq('id', model.id);
  if (error) throw new Error(error.message);
}

/** Events for a tournament (uses RPC matching your schema) */
export async function listTournamentEvents(tournamentId: string): Promise<TournamentEvent[]> {
  const { data, error } = await supabase.rpc('list_tournament_events', { p_tournament_id: tournamentId });
  if (error) throw new Error(error.message);
  return (data ?? []) as TournamentEvent[];
}

/** Seed common presets (idempotent) */
export async function seedTournamentPresets(tournamentId: string): Promise<TournamentEvent[]> {
  const { data, error } = await supabase.rpc('seed_tournament_event_presets', { p_tournament_id: tournamentId });
  if (error) throw new Error(error.message);
  return (data ?? []) as TournamentEvent[];
}

/** Insert/update a single event via RPC */
export async function upsertTournamentEvent(params: {
  tournament_id: string;
  event_type: string;
  age_group: string | null;
  gender: string | null;
  skill_level: string | null;
  registration_fee?: number | null;
  max_entries?: number | null;
}): Promise<TournamentEvent> {
  const { data, error } = await supabase.rpc('upsert_tournament_event', {
    p_tournament_id: params.tournament_id,
    p_event_type: params.event_type,
    p_age_group: params.age_group,
    p_gender: params.gender,
    p_skill_level: params.skill_level,
    p_registration_fee: params.registration_fee ?? null,
    p_max_entries: params.max_entries ?? null,
  });
  if (error) throw new Error(error.message);
  return data as TournamentEvent;
}

/** Matches list */
export async function listTournamentMatches(tournamentId: string): Promise<TournamentMatch[]> {
  const { data, error } = await supabase.rpc('list_tournament_matches', { p_tournament_id: tournamentId });
  if (error) throw new Error(error.message);
  return (data ?? []) as TournamentMatch[];
}

/** Update match score + winner via RPC */
export async function updateMatchScore(params: {
  match_id: string;
  score_a: number;
  score_b: number;
  winner_id: string;
}): Promise<TournamentMatch> {
  const { data, error } = await supabase.rpc('update_match_score', {
    p_match_id: params.match_id,
    p_score_a: params.score_a,
    p_score_b: params.score_b,
    p_winner_id: params.winner_id,
  });
  if (error) throw new Error(error.message);
  return data as TournamentMatch;
}
