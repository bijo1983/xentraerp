import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAuthStore } from '../../../store/authStore';

export type PlayerTournamentEntry = {
  entryId: string;
  entryStatus: string;
  createdAt: string | null;
  event: {
    id: string;
    event_type: string;
    age_group?: string | null;
    gender?: string | null;
    skill_level?: string | null;
    tournament_id: string;
  };
  tournament: {
    id: string;
    name: string;
    location?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    status?: string | null;
  };
  participantType: 'player' | 'pair' | 'group';
  pairId?: string | null;
  groupId?: string | null;
};

export type TournamentEntriesState = {
  entries: PlayerTournamentEntry[];
  loading: boolean;
  error: string | null;
};

const inferParticipantType = (row: any): PlayerTournamentEntry['participantType'] => {
  if (row.player_id) return 'player';
  if (row.group_id) return 'group';
  return 'pair';
};

const inferMatchDiscipline = (event: PlayerTournamentEntry['event']): 'singles' | 'doubles' | 'mixed' => {
  const type = event.event_type?.toLowerCase?.() ?? '';
  if (event.gender?.toLowerCase?.() === 'mixed') {
    return 'mixed';
  }
  if (type.includes('double') || type.includes('pair')) {
    return 'doubles';
  }
  return 'singles';
};

export const usePlayerTournamentEntries = () => {
  const { userProfile } = useAuthStore();
  const [state, setState] = useState<TournamentEntriesState>({ entries: [], loading: true, error: null });

  useEffect(() => {
    if (!userProfile?.id) {
      setState({ entries: [], loading: false, error: 'Unable to determine your profile.' });
      return;
    }

    const loadEntries = async () => {
      setState(prev => ({ ...prev, loading: true, error: null }));

      try {
        const aggregated: any[] = [];

        // Singles registrations
        if (userProfile.type === 'Player') {
          const { data, error } = await supabase
            .from('event_entries')
            .select('id, event_id, entry_status, created_at, player_id')
            .eq('player_id', userProfile.id);

          if (error) throw error;
          aggregated.push(...(data ?? []));
        }

        // Group registrations
        if (userProfile.type === 'Group') {
          const { data, error } = await supabase
            .from('event_entries')
            .select('id, event_id, entry_status, created_at, group_id')
            .eq('group_id', userProfile.id);

          if (error) throw error;
          aggregated.push(...(data ?? []));
        }

        // Pairs registrations (doubles/mixed)
        if (userProfile.type === 'Player') {
          const { data: pairRows, error: pairError } = await supabase
            .from('pairs')
            .select('id, player1_id, player2_id')
            .or(`player1_id.eq.${userProfile.id},player2_id.eq.${userProfile.id}`);

          if (pairError) throw pairError;

          const pairIds = (pairRows ?? []).map(row => row.id);
          if (pairIds.length) {
            const { data, error } = await supabase
              .from('event_entries')
              .select('id, event_id, entry_status, created_at, pair_id')
              .in('pair_id', pairIds);

            if (error) throw error;
            aggregated.push(...(data ?? []).map(row => ({ ...row, pair_id: row.pair_id ?? null })));
          }
        }

        if (!aggregated.length) {
          setState({ entries: [], loading: false, error: null });
          return;
        }

        const deduped = new Map<string, any>();
        aggregated.forEach(row => {
          if (row?.id) {
            deduped.set(row.id, row);
          }
        });

        const rows = Array.from(deduped.values());
        const eventIds = rows.map(row => row.event_id).filter(Boolean);
        if (!eventIds.length) {
          setState({ entries: [], loading: false, error: null });
          return;
        }

        const { data: eventRows, error: eventsError } = await supabase
          .from('tournament_events')
          .select('id, tournament_id, event_type, age_group, gender, skill_level')
          .in('id', eventIds);

        if (eventsError) throw eventsError;

        const eventsMap = new Map((eventRows ?? []).map(event => [event.id, event]));
        const tournamentIds = Array.from(new Set((eventRows ?? []).map(event => event.tournament_id).filter(Boolean)));

        const tournamentsMap = new Map<string, any>();
        if (tournamentIds.length) {
          const { data: tournamentRows, error: tournamentsError } = await supabase
            .from('tournaments')
            .select('id, name, location, start_date, end_date, status')
            .in('id', tournamentIds);

          if (tournamentsError) throw tournamentsError;
          (tournamentRows ?? []).forEach(tournament => {
            tournamentsMap.set(tournament.id, tournament);
          });
        }

        const entries: PlayerTournamentEntry[] = rows
          .map(row => {
            const event = eventsMap.get(row.event_id);
            if (!event) return null;
            const tournament = tournamentsMap.get(event.tournament_id);
            if (!tournament) return null;

            return {
              entryId: row.id,
              entryStatus: row.entry_status ?? 'pending',
              createdAt: row.created_at ?? null,
              event,
              tournament,
              participantType: inferParticipantType(row),
              pairId: row.pair_id ?? null,
              groupId: row.group_id ?? null,
            } satisfies PlayerTournamentEntry;
          })
          .filter(Boolean) as PlayerTournamentEntry[];

        entries.sort((a, b) => {
          const aDate = a.tournament.start_date ?? '';
          const bDate = b.tournament.start_date ?? '';
          return aDate.localeCompare(bDate);
        });

        setState({ entries, loading: false, error: null });
      } catch (error: any) {
        console.error('Failed to load tournament registrations', error);
        setState({ entries: [], loading: false, error: error?.message ?? 'Unable to load your tournament registrations.' });
      }
    };

    void loadEntries();
  }, [userProfile?.id, userProfile?.type]);

  const disciplineByEvent = useMemo(() => {
    const map = new Map<string, ReturnType<typeof inferMatchDiscipline>>();
    state.entries.forEach(entry => {
      map.set(entry.event.id, inferMatchDiscipline(entry.event));
    });
    return map;
  }, [state.entries]);

  return { ...state, disciplineByEvent };
};

export type UsePlayerTournamentEntriesReturn = ReturnType<typeof usePlayerTournamentEntries>;
