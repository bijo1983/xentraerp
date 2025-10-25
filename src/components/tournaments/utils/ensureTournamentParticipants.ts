import { supabase } from "../../../lib/supabase";

type NullableError = { status?: number; code?: string; message?: string } | null;

const isRowSecurityError = (error: NullableError) => {
  if (!error) return false;
  const normalized = (error.message || "").toLowerCase();
  return (
    error.code === "42501" ||
    error.code === "PGRST301" ||
    error.code === "PGRST302" ||
    error.status === 403 ||
    normalized.includes("row-level security") ||
    normalized.includes("not authorized") ||
    normalized.includes("permission denied")
  );
};

/**
 * Ensures that the provided player ids exist inside the tournament_participants table.
 * Handles common row level security fallbacks by attempting to insert only the
 * acting user's participation record when the full bulk upsert is not permitted.
 */
export const ensureTournamentParticipants = async (
  tournamentId: string,
  playerIds: string[],
  actingPlayerId?: string | null,
): Promise<void> => {
  const uniquePlayerIds = Array.from(new Set(playerIds.filter(Boolean)));
  if (!uniquePlayerIds.length) {
    return;
  }

  const rows = uniquePlayerIds.map(playerId => ({
    tournament_id: tournamentId,
    player_id: playerId,
    payment_status: "pending" as const,
  }));

  const { error } = await supabase
    .from("tournament_participants")
    .upsert(rows, { onConflict: "tournament_id,player_id" });

  if (!error) {
    return;
  }

  if (!isRowSecurityError(error)) {
    throw error;
  }

  console.warn("Limited permissions prevented registering all participants", error);

  if (!actingPlayerId) {
    return;
  }

  const ownRows = rows.filter(row => row.player_id === actingPlayerId);
  if (!ownRows.length) {
    return;
  }

  const { error: fallbackError } = await supabase
    .from("tournament_participants")
    .upsert(ownRows, { onConflict: "tournament_id,player_id" });

  if (fallbackError && !isRowSecurityError(fallbackError)) {
    throw fallbackError;
  }
};

