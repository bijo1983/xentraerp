import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

type BracketData = any; // Structure depends on how you generate the draw

type Pair = {
  id: string;
  player1: { id: string; name: string };
  player2: { id: string; name: string };
};

type Player = {
  id: string;
  name: string;
};

type Draw = {
  id: string;
  event_id: string;
  type: string; // 'knockout' or 'round_robin'
  bracket_data: BracketData;
};

interface Props {
  eventId: string;
  eventType: string; // 'singles' | 'doubles' | 'mixed'
}

const BracketView: React.FC<Props> = ({ eventId, eventType }) => {
  const [draw, setDraw] = useState<Draw | null>(null);
  const [pairs, setPairs] = useState<Record<string, Pair>>({});
  const [players, setPlayers] = useState<Record<string, Player>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDraw = async () => {
      setLoading(true);
      // 1. Fetch draw for event
      const { data: drawData } = await supabase
        .from("draws")
        .select("*")
        .eq("event_id", eventId)
        .single();
      setDraw(drawData);

      // 2. Fetch all pairs or players needed for this draw
      if (drawData?.bracket_data && eventType !== "singles") {
        // Collect all pair ids from bracket_data (flatten structure if needed)
        const pairIds = new Set<string>();
        JSON.stringify(drawData.bracket_data, (_, v) => {
          if (v && typeof v === "object" && v.pair_id) pairIds.add(v.pair_id);
          return v;
        });

        if (pairIds.size > 0) {
          const { data: pairRows } = await supabase
            .from("pairs")
            .select("id, player1_id, player2_id, player1:player1_id (id, name), player2:player2_id (id, name)")
            .in("id", Array.from(pairIds));
          const pairMap: Record<string, Pair> = {};
          pairRows?.forEach((row: any) => {
            pairMap[row.id] = {
              id: row.id,
              player1: row.player1,
              player2: row.player2,
            };
          });
          setPairs(pairMap);
        }
      }
      if (drawData?.bracket_data && eventType === "singles") {
        // Collect all player ids
        const playerIds = new Set<string>();
        JSON.stringify(drawData.bracket_data, (_, v) => {
          if (v && typeof v === "object" && v.player_id) playerIds.add(v.player_id);
          return v;
        });
        if (playerIds.size > 0) {
          const { data: playerRows } = await supabase
            .from("player_users")
            .select("id, name")
            .in("id", Array.from(playerIds));
          const playerMap: Record<string, Player> = {};
          playerRows?.forEach((row: any) => {
            playerMap[row.id] = { id: row.id, name: row.name };
          });
          setPlayers(playerMap);
        }
      }
      setLoading(false);
    };
    fetchDraw();
  }, [eventId, eventType]);

  if (loading) return <div className="p-6 text-center">Loading draw...</div>;
  if (!draw) return <div className="p-6 text-center text-gray-500">No draw available for this event.</div>;

  // For demo: renders a simple bracket. In production, you'd use a bracket library or custom rendering.
  const renderMatch = (match: any, roundIdx: number, matchIdx: number) => {
    let nameA = "", nameB = "";
    if (eventType === "singles") {
      nameA = players[match.player1_id]?.name || "TBD";
      nameB = players[match.player2_id]?.name || "TBD";
    } else {
      const pairA = pairs[match.pair1_id];
      const pairB = pairs[match.pair2_id];
      nameA = pairA
        ? `${pairA.player1?.name || "?"} & ${pairA.player2?.name || "?"}`
        : "TBD";
      nameB = pairB
        ? `${pairB.player1?.name || "?"} & ${pairB.player2?.name || "?"}`
        : "TBD";
    }
    return (
      <div key={matchIdx} className="border rounded p-2 mb-2 bg-gray-50">
        <div className="font-semibold">{nameA} <span className="text-gray-500">vs</span> {nameB}</div>
        {/* Optional: Add scores, scheduled time, etc. */}
      </div>
    );
  };

  return (
    <div className="p-4">
      <h3 className="text-lg font-bold mb-4">Bracket / Draw</h3>
      {draw.type === "knockout" && draw.bracket_data?.rounds
        ? draw.bracket_data.rounds.map((round: any, roundIdx: number) => (
            <div key={roundIdx} className="mb-6">
              <div className="font-bold mb-2">Round {roundIdx + 1}</div>
              {round.matches.map((match: any, matchIdx: number) =>
                renderMatch(match, roundIdx, matchIdx)
              )}
            </div>
          ))
        : <div>Unsupported bracket format or no data.</div>}
    </div>
  );
};

export default BracketView;
