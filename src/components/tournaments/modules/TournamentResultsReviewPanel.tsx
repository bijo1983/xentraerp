import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";

interface TournamentEventSummary {
  id: string;
  event_type: string;
  gender?: string | null;
  age_group?: string | null;
  skill_level?: string | null;
}

interface MatchRow {
  id: string;
  draw_id: string;
  round: number;
  status: string;
  result_data: { score?: string; winner_id?: string } | null;
  player1_id?: string | null;
  player2_id?: string | null;
  pair1_id?: string | null;
  pair2_id?: string | null;
}

interface PlayerSummary {
  id: string;
  name: string;
}

interface PairSummary {
  id: string;
  player1: PlayerSummary;
  player2: PlayerSummary;
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

const TournamentResultsReviewPanel: React.FC<Props> = ({ tournamentId }) => {
  const [events, setEvents] = useState<TournamentEventSummary[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [players, setPlayers] = useState<Record<string, PlayerSummary>>({});
  const [pairs, setPairs] = useState<Record<string, PairSummary>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchResults = async () => {
      setLoading(true);
      setError(null);

      try {
        const { data: eventRows, error: eventError } = await supabase
          .from("tournament_events")
          .select("id, event_type, gender, age_group, skill_level")
          .eq("tournament_id", tournamentId);

        if (eventError) {
          throw eventError;
        }

        setEvents(eventRows || []);

        const eventIds = (eventRows || []).map(event => event.id);
        if (!eventIds.length) {
          setMatches([]);
          setPlayers({});
          setPairs({});
          setLoading(false);
          return;
        }

        const { data: matchRows, error: matchError } = await supabase
          .from("matches")
          .select("id, draw_id, round, status, result_data, player1_id, player2_id, pair1_id, pair2_id")
          .in("draw_id", eventIds)
          .eq("status", "completed");

        if (matchError) {
          throw matchError;
        }

        const rows = matchRows || [];
        setMatches(rows);

        const singlesWinnerIds = new Set<string>();
        const pairWinnerIds = new Set<string>();

        rows.forEach(row => {
          const winnerId = row.result_data?.winner_id;
          if (!winnerId) return;
          const event = eventRows?.find(ev => ev.id === row.draw_id);
          if (!event) return;
          const matchType = inferMatchType(event);
          if (matchType === "singles") {
            singlesWinnerIds.add(winnerId);
            if (row.player1_id) singlesWinnerIds.add(row.player1_id);
            if (row.player2_id) singlesWinnerIds.add(row.player2_id);
          } else {
            pairWinnerIds.add(winnerId);
            if (row.pair1_id) pairWinnerIds.add(row.pair1_id);
            if (row.pair2_id) pairWinnerIds.add(row.pair2_id);
          }
        });

        const playerMap: Record<string, PlayerSummary> = {};
        const pairMap: Record<string, PairSummary> = {};

        if (singlesWinnerIds.size) {
          const { data } = await supabase
            .from("player_users")
            .select("id, name")
            .in("id", Array.from(singlesWinnerIds));
          (data || []).forEach(player => {
            playerMap[player.id] = { id: player.id, name: player.name };
          });
        }

        if (pairWinnerIds.size) {
          const { data } = await supabase
            .from("pairs")
            .select("id, player1:player1_id(id, name), player2:player2_id(id, name)")
            .in("id", Array.from(pairWinnerIds));
          (data || []).forEach(pair => {
            pairMap[pair.id] = {
              id: pair.id,
              player1: { id: pair.player1.id, name: pair.player1.name },
              player2: { id: pair.player2.id, name: pair.player2.name },
            };
          });
        }

        setPlayers(playerMap);
        setPairs(pairMap);
      } catch (err: any) {
        setError(
          err?.message ||
            "Unable to load results. Ensure completed matches are stored in the matches table.",
        );
        setEvents([]);
        setMatches([]);
        setPlayers({});
        setPairs({});
      }

      setLoading(false);
    };

    fetchResults();
  }, [tournamentId]);

  const groupedMatches = useMemo(() => {
    const map: Record<string, MatchRow[]> = {};
    matches.forEach(match => {
      if (!map[match.draw_id]) {
        map[match.draw_id] = [];
      }
      map[match.draw_id].push(match);
    });
    return map;
  }, [matches]);

  if (loading) {
    return <div className="p-4">Loading results...</div>;
  }

  if (error) {
    return <div className="p-4 text-red-600">{error}</div>;
  }

  if (!events.length) {
    return (
      <div className="p-4 text-sm text-gray-600">
        Add categories and play matches to review winners here.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {events.map(event => {
        const matchesForEvent = groupedMatches[event.id] || [];
        const latestMatch = matchesForEvent[matchesForEvent.length - 1];
        const winnerId = latestMatch?.result_data?.winner_id;
        const matchType = inferMatchType(event);
        let winnerName = "Awaiting confirmation";
        if (winnerId) {
          if (matchType === "singles") {
            winnerName = players[winnerId]?.name || winnerId;
          } else {
            const pair = pairs[winnerId];
            if (pair) {
              winnerName = `${pair.player1.name} & ${pair.player2.name}`;
            } else {
              winnerName = winnerId;
            }
          }
        }

        const headerParts = [event.event_type];
        if (event.age_group) headerParts.push(event.age_group);
        if (event.skill_level) headerParts.push(event.skill_level);
        if (event.gender) headerParts.push(event.gender);

        return (
          <div key={event.id} className="rounded border bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-semibold text-gray-800">
                  {headerParts.join(" · ")}
                </h4>
                <p className="text-sm text-gray-500">
                  {matchesForEvent.length}
                  {" "}
                  completed match{matchesForEvent.length === 1 ? "" : "es"}
                </p>
              </div>
              <div className="text-right text-sm">
                <div className="font-semibold text-green-700">{winnerName}</div>
                <div className="text-gray-500">
                  {latestMatch?.result_data?.score || "Score pending"}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default TournamentResultsReviewPanel;
