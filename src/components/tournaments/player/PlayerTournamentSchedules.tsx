import React, { useEffect, useMemo, useState } from 'react';
import MatchSchedule from '../MatchSchedule';
import { usePlayerTournamentEntries } from './usePlayerTournamentEntries';

const formatEventLabel = (event: { event_type: string; age_group?: string | null; gender?: string | null; skill_level?: string | null }) => {
  const parts = [event.event_type];
  if (event.age_group) parts.push(event.age_group);
  if (event.skill_level) parts.push(event.skill_level);
  if (event.gender) parts.push(event.gender);
  return parts.filter(Boolean).join(' · ');
};

export const PlayerTournamentSchedules: React.FC = () => {
  const { entries, loading, error, disciplineByEvent } = usePlayerTournamentEntries();
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  useEffect(() => {
    if (!entries.length) {
      setSelectedEventId(null);
      return;
    }
    if (!selectedEventId || !entries.some(entry => entry.event.id === selectedEventId)) {
      setSelectedEventId(entries[0]?.event.id ?? null);
    }
  }, [entries, selectedEventId]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof entries>();
    entries.forEach(entry => {
      const bucket = map.get(entry.tournament.id) ?? [];
      bucket.push(entry);
      map.set(entry.tournament.id, bucket);
    });
    return map;
  }, [entries]);

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="text-text-secondary text-sm">Loading schedules...</div>
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
          Match schedules will appear once you register for a tournament event.
        </div>
      </div>
    );
  }

  const selectedEntry = entries.find(entry => entry.event.id === selectedEventId) ?? entries[0];
  const discipline = selectedEntry ? disciplineByEvent.get(selectedEntry.event.id) ?? 'singles' : 'singles';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Match Schedules</h1>
        <p className="text-sm text-text-secondary mt-1">Track upcoming matches for every category you have joined.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px,1fr]">
        <div className="rounded-xl border border-background-subtle bg-background shadow-sm">
          <div className="border-b border-background-subtle px-4 py-3 text-sm font-semibold text-text-primary">My Entries</div>
          <div className="max-h-[60vh] overflow-y-auto">
            {[...grouped.entries()].map(([tournamentId, tournamentEntries]) => {
              const tournament = tournamentEntries[0]?.tournament;
              if (!tournament) return null;
              return (
                <div key={tournamentId} className="border-b border-background-subtle last:border-b-0">
                  <div className="px-4 pt-3 pb-1 text-xs uppercase tracking-wide text-text-secondary">
                    {tournament.name}
                  </div>
                  <ul className="px-2 pb-2">
                    {tournamentEntries.map(entry => {
                      const isActive = entry.event.id === selectedEventId;
                      return (
                        <li key={entry.event.id}>
                          <button
                            onClick={() => setSelectedEventId(entry.event.id)}
                            className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                              isActive
                                ? 'bg-primary-50 text-primary-700 shadow-inner'
                                : 'hover:bg-background-subtle text-text-secondary'
                            }`}
                          >
                            <div className="font-medium text-text-primary">{formatEventLabel(entry.event)}</div>
                            <div className="text-xs text-text-secondary">
                              {entry.tournament.location || 'Location TBA'}
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-background-subtle bg-background shadow-sm p-4">
          {selectedEntry ? (
            <>
              <div className="mb-4">
                <div className="text-sm font-semibold text-text-primary">{selectedEntry.tournament.name}</div>
                <div className="text-xs text-text-secondary">{formatEventLabel(selectedEntry.event)}</div>
              </div>
              <MatchSchedule eventId={selectedEntry.event.id} eventType={discipline} />
            </>
          ) : (
            <div className="text-sm text-text-secondary">Select a category to view its schedule.</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PlayerTournamentSchedules;
