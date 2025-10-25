import React from 'react';
import { format } from 'date-fns';
import { usePlayerTournamentEntries } from './usePlayerTournamentEntries';

const formatDate = (value?: string | null) => {
  if (!value) return '-';
  try {
    return format(new Date(value), 'PP');
  } catch (error) {
    return value ?? '-';
  }
};

const formatEventLabel = (event: { event_type: string; age_group?: string | null; gender?: string | null; skill_level?: string | null }) => {
  const parts = [event.event_type];
  if (event.age_group) parts.push(event.age_group);
  if (event.skill_level) parts.push(event.skill_level);
  if (event.gender) parts.push(event.gender);
  return parts.filter(Boolean).join(' · ');
};

const participantLabel: Record<'player' | 'pair' | 'group', string> = {
  player: 'Singles',
  pair: 'Doubles / Mixed',
  group: 'Team / Group',
};

export const PlayerRegisteredTournaments: React.FC = () => {
  const { entries, loading, error } = usePlayerTournamentEntries();

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="text-text-secondary text-sm">Loading your registrations...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      </div>
    );
  }

  if (!entries.length) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="rounded-lg border border-dashed border-background-subtle bg-background p-6 text-center text-sm text-text-secondary">
          You have not registered for any tournaments yet.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Registered Tournaments</h1>
        <p className="text-sm text-text-secondary mt-1">
          Review every tournament entry across singles, doubles, and group events.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-background-subtle bg-background shadow-sm">
        <table className="min-w-full divide-y divide-background-subtle text-sm">
          <thead className="bg-background-subtle text-left text-xs font-semibold uppercase tracking-wide text-text-secondary">
            <tr>
              <th className="px-4 py-3">Tournament</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Discipline</th>
              <th className="px-4 py-3">Dates</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Registered On</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-background-subtle">
            {entries.map(entry => (
              <tr key={entry.entryId} className="hover:bg-background-subtle/60">
                <td className="px-4 py-3">
                  <div className="font-medium text-text-primary">{entry.tournament.name}</div>
                  <div className="text-xs text-text-secondary">{entry.tournament.location || 'Location TBA'}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-text-primary">{formatEventLabel(entry.event)}</div>
                  <div className="text-xs text-text-secondary">Event #{entry.event.id.slice(0, 8)}</div>
                </td>
                <td className="px-4 py-3">{participantLabel[entry.participantType]}</td>
                <td className="px-4 py-3">
                  <div>{formatDate(entry.tournament.start_date)} – {formatDate(entry.tournament.end_date)}</div>
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex rounded-full bg-primary-50 px-2.5 py-1 text-xs font-semibold text-primary-700">
                    {entry.entryStatus.replace(/_/g, ' ').toUpperCase()}
                  </span>
                </td>
                <td className="px-4 py-3 text-text-secondary">{formatDate(entry.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PlayerRegisteredTournaments;
