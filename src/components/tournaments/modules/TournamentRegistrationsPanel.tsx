import React, { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";

interface RegistrationRow {
  id: string;
  status?: string | null;
  created_at?: string | null;
  player?: { id: string; name?: string | null } | null;
  event?: {
    id: string;
    event_type: string;
    age_group?: string | null;
    gender?: string | null;
    skill_level?: string | null;
  } | null;
}

interface Props {
  tournamentId: string;
}

const TournamentRegistrationsPanel: React.FC<Props> = ({ tournamentId }) => {
  const [rows, setRows] = useState<RegistrationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchRegistrations = async () => {
      setLoading(true);
      setError(null);

      try {
        const { data, error: fetchError } = await supabase
          .from("tournament_registrations")
          .select(
            "id, status, created_at, player:player_id(id, name), event:tournament_event_id(id, event_type, age_group, gender, skill_level)",
          )
          .eq("tournament_id", tournamentId)
          .order("created_at", { ascending: false });

        if (fetchError) {
          throw fetchError;
        }

        setRows(data || []);
      } catch (err: any) {
        setError(
          err?.message ||
            "Unable to load registrations. Ensure the tournament_registrations table is available.",
        );
        setRows([]);
      }

      setLoading(false);
    };

    fetchRegistrations();
  }, [tournamentId]);

  if (loading) {
    return <div className="p-4">Loading registrations...</div>;
  }

  if (error) {
    return <div className="p-4 text-red-600">{error}</div>;
  }

  if (!rows.length) {
    return (
      <div className="p-4 text-sm text-gray-600">
        No players have registered yet. Share the registration link once
        categories are confirmed so that players can join the tournament.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-2 text-left font-semibold text-gray-600">
              Player
            </th>
            <th className="px-4 py-2 text-left font-semibold text-gray-600">
              Category
            </th>
            <th className="px-4 py-2 text-left font-semibold text-gray-600">
              Status
            </th>
            <th className="px-4 py-2 text-left font-semibold text-gray-600">
              Registered On
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {rows.map(row => {
            const categoryParts = [row.event?.event_type];
            if (row.event?.age_group) categoryParts.push(row.event.age_group);
            if (row.event?.skill_level) categoryParts.push(row.event.skill_level);
            if (row.event?.gender) categoryParts.push(row.event.gender);
            const category = categoryParts.filter(Boolean).join(" · ") || "-";

            return (
              <tr key={row.id}>
                <td className="px-4 py-2">{row.player?.name || row.player?.id || "-"}</td>
                <td className="px-4 py-2">{category}</td>
                <td className="px-4 py-2 capitalize">{row.status || "pending"}</td>
                <td className="px-4 py-2">
                  {row.created_at
                    ? new Date(row.created_at).toLocaleString()
                    : "-"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default TournamentRegistrationsPanel;
