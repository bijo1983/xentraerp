import React, { useEffect, useMemo, useState } from 'react';
import TournamentResultsReviewPanel from '../modules/TournamentResultsReviewPanel';
import { usePlayerTournamentEntries } from './usePlayerTournamentEntries';

const formatEventLabel = (event: { event_type: string; age_group?: string | null; gender?: string | null; skill_level?: string | null }) => {
  const parts = [event.event_type];
  if (event.age_group) parts.push(event.age_group);
  if (event.skill_level) parts.push(event.skill_level);
  if (event.gender) parts.push(event.gender);
  return parts.filter(Boolean).join(' · ');
};

export const PlayerTournamentResults: React.FC = () => {
  const { entries, loading, error } = usePlayerTournamentEntries();
  const [selectedTournamentId, setSelectedTournamentId] = useState<string | null>(null);

  useEffect(() => {
    if (!entries.length) {
      setSelectedTournamentId(null);
      return;
    }
    if (!selectedTournamentId || !entries.some(entry => entry.tournament.id === selectedTournamentId)) {
      setSelectedTournamentId(entries[0]?.tournament.id ?? null);
    }
  }, [entries, selectedTournamentId]);

  const tournaments = useMemo(() => {
    const map = new Map<string, { id: string; name: string; entries: typeof entries }>();
    entries.forEach(entry => {
      const bucket = map.get(entry.tournament.id) ?? { id: entry.tournament.id, name: entry.tournament.name, entries: [] as typeof entries };
      bucket.entries = [...bucket.entries, entry];
      map.set(entry.tournament.id, bucket);
    });
    return Array.from(map.values());
  }, [entries]);

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="text-text-secondary text-sm">Loading results...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      </div>
    );
  }

  if (!entries.length) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="rounded-lg border border-dashed border-background-subtle bg-background p-6 text-center text-sm text-text-secondary">
          Tournament results will be available once you complete matches.
        </div>
      </div>
    );
  }

  const selectedTournament = tournaments.find(t => t.id === selectedTournamentId) ?? tournaments[0];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Tournament Results</h1>
        <p className="text-sm text-text-secondary mt-1">Review podium placements and champions for your events.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px,1fr]">
        <div className="rounded-xl border border-background-subtle bg-background shadow-sm">
          <div className="border-b border-background-subtle px-4 py-3 text-sm font-semibold text-text-primary">My Tournaments</div>
          <div className="max-h-[60vh] overflow-y-auto">
            {tournaments.map(tournament => (
              <div key={tournament.id} className="border-b border-background-subtle last:border-b-0">
                <button
                  onClick={() => setSelectedTournamentId(tournament.id)}
                  className={`w-full px-4 py-3 text-left text-sm transition ${
                    tournament.id === selectedTournamentId
                      ? 'bg-primary-50 text-primary-700 shadow-inner'
                      : 'hover:bg-background-subtle text-text-secondary'
                  }`}
                >
                  <div className="font-medium text-text-primary">{tournament.name}</div>
                  <div className="text-xs text-text-secondary">
                    {tournament.entries.map(entry => formatEventLabel(entry.event)).join(', ')}
                  </div>
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-background-subtle bg-background shadow-sm p-4">
          {selectedTournament ? (
            <TournamentResultsReviewPanel tournamentId={selectedTournament.id} />
          ) : (
            <div className="text-sm text-text-secondary">Select a tournament to review detailed results.</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PlayerTournamentResults;
