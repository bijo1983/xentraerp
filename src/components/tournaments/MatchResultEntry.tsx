import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuthStore } from "../../store/authStore";

type Match = {
  id: string;
  scheduled_time: string;
  court_id: string;
  round: number;
  status: string;
  result_data: any;
  player1_id?: string;
  player2_id?: string;
  pair1_id?: string;
  pair2_id?: string;
};

type Player = { id: string; name: string };
type Pair = { id: string; player1: Player; player2: Player };

interface Props {
  eventId: string;
  eventType: string; // "singles" | "doubles" | "mixed"
}

const MatchResultEntry: React.FC<Props> = ({ eventId, eventType }) => {
  const { userProfile } = useAuthStore();
  const [matches, setMatches] = useState<Match[]>([]);
  const [players, setPlayers] = useState<Record<string, Player>>({});
  const [pairs, setPairs] = useState<Record<string, Pair>>({});
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [scoreA, setScoreA] = useState("");
  const [scoreB, setScoreB] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  // Fetch matches for the event
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      let { data: matchRows } = await supabase
        .from("matches")
        .select("*")
        .eq("draw_id", eventId);
      matchRows = matchRows || [];

      // Fetch players and pairs for names
      const playerIds = new Set<string>();
      const pairIds = new Set<string>();
      matchRows.forEach((m: Match) => {
        if (m.player1_id) playerIds.add(m.player1_id);
        if (m.player2_id) playerIds.add(m.player2_id);
        if (m.pair1_id) pairIds.add(m.pair1_id);
        if (m.pair2_id) pairIds.add(m.pair2_id);
      });

      let playerMap: Record<string, Player> = {};
      if (playerIds.size) {
        const { data } = await supabase
          .from("player_users")
          .select("id, name")
          .in("id", Array.from(playerIds));
        (data || []).forEach((p: Player) => (playerMap[p.id] = p));
      }

      let pairMap: Record<string, Pair> = {};
      if (pairIds.size) {
        const { data } = await supabase
          .from("pairs")
          .select("id, player1:player1_id(id, name), player2:player2_id(id, name)")
          .in("id", Array.from(pairIds));
        (data || []).forEach((pair: any) => {
          pairMap[pair.id] = {
            id: pair.id,
            player1: pair.player1,
            player2: pair.player2,
          };
        });
      }

      setMatches(matchRows);
      setPlayers(playerMap);
      setPairs(pairMap);
      setLoading(false);
    };
    fetchData();
  }, [eventId, eventType, message]);

  // Submit result
  const submitResult = async () => {
    if (!selectedMatch) return;
    setLoading(true);
    try {
      // Determine winner (simple logic: higher score wins)
      const sA = parseInt(scoreA, 10);
      const sB = parseInt(scoreB, 10);
      let winnerId: string | undefined;
      if (eventType === "singles") {
        winnerId = sA > sB ? selectedMatch.player1_id : selectedMatch.player2_id;
      } else {
        winnerId = sA > sB ? selectedMatch.pair1_id : selectedMatch.pair2_id;
      }

      const { error } = await supabase
        .from("matches")
        .update({
          result_data: { score: `${scoreA}-${scoreB}`, winner_id: winnerId },
          status: "completed",
        })
        .eq("id", selectedMatch.id);
      if (error) throw error;
      setMessage("Result submitted!");
      setSelectedMatch(null);
      setScoreA("");
      setScoreB("");
    } catch (err: any) {
      setMessage("Failed to submit result: " + (err.message || err));
    }
    setLoading(false);
  };

  return (
    <div className="p-4">
      <h3 className="text-lg font-bold mb-4">Match Result Entry</h3>
      {message && <div className="mb-4 text-green-600">{message}</div>}
      {loading && <div>Loading...</div>}
      {!selectedMatch ? (
        <div className="space-y-4">
          {matches.length === 0 ? (
            <div className="text-gray-500">No matches scheduled.</div>
          ) : (
            matches.map((match) => (
              <div key={match.id} className="p-3 rounded border bg-gray-50 flex items-center justify-between">
                <div>
                  <b>
                    {eventType === "singles"
                      ? `${players[match.player1_id!]?.name || "?"} vs ${players[match.player2_id!]?.name || "?"}`
                      : `${pairs[match.pair1_id!]?.player1.name || "?"} & ${pairs[match.pair1_id!]?.player2.name || "?"} vs ${pairs[match.pair2_id!]?.player1.name || "?"} & ${pairs[match.pair2_id!]?.player2.name || "?"}`}
                  </b>{" "}
                  <span className="text-gray-600 ml-2">[Round {match.round}]</span>
                </div>
                <button
                  className="bg-blue-600 text-white px-3 py-1 rounded"
                  onClick={() => setSelectedMatch(match)}
                >
                  Enter Result
                </button>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="p-4 border rounded bg-white">
          <h4 className="font-semibold mb-2">Enter Result</h4>
          <div className="mb-2">
            <b>
              {eventType === "singles"
                ? `${players[selectedMatch.player1_id!]?.name || "?"} vs ${players[selectedMatch.player2_id!]?.name || "?"}`
                : `${pairs[selectedMatch.pair1_id!]?.player1.name || "?"} & ${pairs[selectedMatch.pair1_id!]?.player2.name || "?"} vs ${pairs[selectedMatch.pair2_id!]?.player1.name || "?"} & ${pairs[selectedMatch.pair2_id!]?.player2.name || "?"}`}
            </b>
          </div>
          <div className="flex gap-2 mb-2 items-center">
            <input
              type="number"
              className="border rounded p-2 w-20"
              placeholder="Score A"
              value={scoreA}
              onChange={e => setScoreA(e.target.value)}
              required
            />
            <span>-</span>
            <input
              type="number"
              className="border rounded p-2 w-20"
              placeholder="Score B"
              value={scoreB}
              onChange={e => setScoreB(e.target.value)}
              required
            />
          </div>
          <div className="flex gap-3">
            <button
              className="bg-green-600 text-white px-4 py-2 rounded"
              onClick={submitResult}
              disabled={loading}
            >
              Submit Result
            </button>
            <button
              className="bg-gray-400 text-white px-4 py-2 rounded"
              onClick={() => setSelectedMatch(null)}
              disabled={loading}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MatchResultEntry;
