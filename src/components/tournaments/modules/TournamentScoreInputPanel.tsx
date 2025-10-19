import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";
import MatchResultEntry from "../MatchResultEntry";

interface TournamentEventSummary {
  id: string;
  event_type: string;
  gender?: string | null;
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

const TournamentScoreInputPanel: React.FC<Props> = ({ tournamentId }) => {
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
        .select("id, event_type, gender")
        .eq("tournament_id", tournamentId)
        .order("event_type");

      if (fetchError) {
        setError(fetchError.message || "Unable to load events.");
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
    return <div className="p-4">Loading events...</div>;
  }

  if (error) {
    return <div className="p-4 text-red-600">{error}</div>;
  }

  if (!events.length) {
    return (
      <div className="p-4 text-sm text-gray-600">
        Add categories first to begin entering match scores for this tournament.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {events.map(event => (
          <button
            key={event.id}
            type="button"
            onClick={() => setSelectedEventId(event.id)}
            className={`rounded border px-3 py-1 text-sm transition ${
              selectedEventId === event.id
                ? "border-green-500 bg-green-50 text-green-700"
                : "border-gray-200 bg-white hover:border-green-300"
            }`}
          >
            {event.event_type}
          </button>
        ))}
      </div>

      {selectedEvent ? (
        <div className="rounded border bg-white shadow-sm">
          <MatchResultEntry
            eventId={selectedEvent.id}
            eventType={inferMatchType(selectedEvent)}
          />
        </div>
      ) : (
        <div className="p-4 text-sm text-gray-600">
          Choose a category to start entering results.
        </div>
      )}
    </div>
  );
};

export default TournamentScoreInputPanel;
