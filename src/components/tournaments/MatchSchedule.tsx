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
type Court = { id: string; name: string };

interface Props {
  eventId: string;
  eventType: string; // "singles" | "doubles" | "mixed"
}

const MatchSchedule: React.FC<Props> = ({ eventId, eventType }) => {
  const { userProfile } = useAuthStore();
  const [matches, setMatches] = useState<Match[]>([]);
  const [players, setPlayers] = useState<Record<string, Player>>({});
  const [pairs, setPairs] = useState<Record<string, Pair>>({});
  const [courts, setCourts] = useState<Record<string, Court>>({});
  const [loading, setLoading] = useState(true);

  // Fetch matches, players, pairs, courts
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      // Fetch matches for this event
      let { data: matchRows } = await supabase
        .from("matches")
        .select("*")
        .eq("draw_id", eventId); // You may need to adjust if draw/event mapping is different

      matchRows = matchRows || [];

      // Collect player/pair/court IDs
      const playerIds = new Set<string>();
      const pairIds = new Set<string>();
      const courtIds = new Set<string>();
      matchRows.forEach((m: Match) => {
        if (m.player1_id) playerIds.add(m.player1_id);
        if (m.player2_id) playerIds.add(m.player2_id);
        if (m.pair1_id) pairIds.add(m.pair1_id);
        if (m.pair2_id) pairIds.add(m.pair2_id);
        if (m.court_id) courtIds.add(m.court_id);
      });

      // Fetch player names
      let playerMap: Record<string, Player> = {};
      if (playerIds.size) {
        const { data } = await supabase
          .from("player_users")
          .select("id, name")
          .in("id", Array.from(playerIds));
        (data || []).forEach((p: Player) => (playerMap[p.id] = p));
      }

      // Fetch pair names
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

      // Fetch courts
      let courtMap: Record<string, Court> = {};
      if (courtIds.size) {
        const { data } = await supabase
          .from("courts")
          .select("id, name")
          .in("id", Array.from(courtIds));
        (data || []).forEach((court: Court) => (courtMap[court.id] = court));
      }

      setMatches(matchRows);
      setPlayers(playerMap);
      setPairs(pairMap);
      setCourts(courtMap);
      setLoading(false);
    };
    fetchData();
  }, [eventId, eventType]);

  // Filter: Show matches for this user/player or their pair
  const userMatches = matches.filter((match) => {
    if (eventType === "singles") {
      return match.player1_id === userProfile.id || match.player2_id === userProfile.id;
    }
    // For doubles, assume pair_id logic (user is a member of pair1 or pair2)
    const userPairIds = Object.values(pairs)
      .filter(
        (pair) =>
          pair.player1.id === userProfile.id ||
          pair.player2.id === userProfile.id
      )
      .map((pair) => pair.id);
    return (
      (match.pair1_id && userPairIds.includes(match.pair1_id)) ||
      (match.pair2_id && userPairIds.includes(match.pair2_id))
    );
  });

  return (
    <div className="p-4">
      <h3 className="text-lg font-bold mb-4">My Matches</h3>
      {loading ? (
        <div>Loading...</div>
      ) : userMatches.length === 0 ? (
        <div className="text-gray-500">No scheduled matches found.</div>
      ) : (
        <div className="space-y-4">
          {userMatches.map((match) => (
            <div key={match.id} className="p-3 rounded border bg-gray-50">
              <div>
                <b>Round:</b> {match.round} <b>Court:</b>{" "}
                {courts[match.court_id]?.name || "-"}
              </div>
              <div>
                <b>Opponent:</b>{" "}
                {eventType === "singles"
                  ? [match.player1_id, match.player2_id]
                      .filter((id) => id !== userProfile.id)
                      .map((oppId) => players[oppId]?.name)
                      .join(" vs ")
                  : [match.pair1_id, match.pair2_id]
                      .filter(
                        (id) =>
                          id &&
                          !Object.values(pairs)
                            .filter(
                              (pair) =>
                                pair.player1.id === userProfile.id ||
                                pair.player2.id === userProfile.id
                            )
                            .map((pair) => pair.id)
                            .includes(id!)
                      )
                      .map(
                        (oppId) =>
                          pairs[oppId!]
                            ? `${pairs[oppId!].player1.name} & ${pairs[oppId!].player2.name}`
                            : ""
                      )
                      .join(" vs ")
                }
              </div>
              <div>
                <b>When:</b> {match.scheduled_time
                  ? new Date(match.scheduled_time).toLocaleString()
                  : "TBD"}
              </div>
              <div>
                <b>Status:</b> {match.status}
              </div>
              {match.result_data && (
                <div>
                  <b>Result:</b>{" "}
                  {match.result_data.score
                    ? match.result_data.score
                    : JSON.stringify(match.result_data)}
                </div>
              )}
              {/* Organizer/referee result entry button could be added here */}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MatchSchedule;
