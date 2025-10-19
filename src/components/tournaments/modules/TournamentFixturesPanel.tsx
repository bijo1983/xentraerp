import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";
import MatchSchedule from "../MatchSchedule";

interface TournamentEventSummary {
  id: string;
  event_type: string;
  gender?: string | null;
  age_group?: string | null;
  skill_level?: string | null;
}

interface Props {
  tournamentId: string;
}

const inferMatchType = (event: TournamentEventSummary): "singles" | "doubles" | "mixed" => {
  if (event.gender === "mixed") return "mixed";
  const lowered = event.event_type.toLowerCase();
  if (lowered.includes("double")) {
    return "doubles";
  }
  return "singles";
};

const TournamentFixturesPanel: React.FC<Props> = ({ tournamentId }) => {
  const [events, setEvents] = useState<TournamentEventSummary[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchEvents = async () => {
      setLoading(true);
      setError(null);
      const { data, error: fetchError } = await supabase
        .from("tournament_events")
        .select("id, event_type, gender, age_group, skill_level")
        .eq("tournament_id", tournamentId)
        .order("event_type");

      if (fetchError) {
        setError(fetchError.message || "Unable to load events for fixtures.");
        setEvents([]);
        setSelectedEventId(null);
      } else {
        setEvents(data || []);
        setSelectedEventId(data?.[0]?.id ?? null);
      }
      setLoading(false);
    };

    fetchEvents();
  }, [tournamentId]);

  const selectedEvent = useMemo(
    () => events.find(event => event.id === selectedEventId) || null,
    [events, selectedEventId],
  );

  if (loading) {
    return <div className="p-4">Loading fixtures...</div>;
  }

  if (error) {
    return <div className="p-4 text-red-600">{error}</div>;
  }

  if (!events.length) {
    return (
      <div className="p-4 text-sm text-gray-600">
        No categories are available yet. Configure categories first to unlock
        fixture generation for this tournament.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {events.map(event => {
          const labelParts = [event.event_type];
          if (event.age_group) labelParts.push(event.age_group);
          if (event.skill_level) labelParts.push(event.skill_level);
          if (event.gender) labelParts.push(event.gender);
          const label = labelParts.join(" · ");

          return (
            <button
              key={event.id}
              type="button"
              onClick={() => setSelectedEventId(event.id)}
              className={`rounded border px-3 py-1 text-sm transition ${
                selectedEventId === event.id
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-gray-200 bg-white hover:border-blue-300"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {selectedEvent ? (
        <div className="rounded border bg-white shadow-sm">
          <MatchSchedule
            eventId={selectedEvent.id}
            eventType={inferMatchType(selectedEvent)}
          />
        </div>
      ) : (
        <div className="p-4 text-sm text-gray-600">
          Select a category to view its planned fixtures.
        </div>
      )}
    </div>
  );
};

export default TournamentFixturesPanel;
