import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuthStore } from "../../store/authStore";
import { ensureTournamentParticipants } from "./utils/ensureTournamentParticipants";

type InvitationRow = {
  id: string;
  tournament_id: string;
  event_id: string;
  pair_id: string;
  inviter_id: string;
  invitee_id: string;
  created_at: string;
  tournaments?: {
    id: string;
    name: string;
    start_date?: string | null;
    end_date?: string | null;
  } | null;
  tournament_events?: {
    id: string;
    event_type: string;
    age_group?: string | null;
    gender?: string | null;
    skill_level?: string | null;
  } | null;
  inviter?: {
    id: string;
    full_name?: string | null;
  } | null;
};

interface Props {
  onHandled?: (message: string) => void;
}

const buildEventLabel = (invitation: InvitationRow) => {
  const event = invitation.tournament_events;
  if (!event) return "-";
  const parts: string[] = [event.event_type];
  if (event.age_group) parts.push(event.age_group);
  if (event.skill_level) parts.push(event.skill_level);
  if (event.gender) parts.push(event.gender);
  return parts.filter(Boolean).join(" · ");
};

const PendingPairInvitations: React.FC<Props> = ({ onHandled }) => {
  const { userProfile } = useAuthStore();
  const [invitations, setInvitations] = useState<InvitationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  const loadInvitations = async () => {
    if (!userProfile?.id) {
      setInvitations([]);
      return;
    }

    setLoading(true);
    setError(null);

    const { data, error: loadError } = await supabase
      .from("tournament_pair_invitations")
      .select(
        `
          id,
          tournament_id,
          event_id,
          pair_id,
          inviter_id,
          invitee_id,
          created_at,
          tournaments ( id, name, start_date, end_date ),
          tournament_events ( id, event_type, age_group, gender, skill_level ),
          inviter:player_users!tournament_pair_invitations_inviter_id_fkey ( id, full_name )
        `,
      )
      .eq("invitee_id", userProfile.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (loadError) {
      console.error("Failed to load pending pair invitations", loadError);
      setError("Unable to load pending invitations right now.");
      setInvitations([]);
      setLoading(false);
      return;
    }

    setInvitations((data || []) as InvitationRow[]);
    setLoading(false);
  };

  useEffect(() => {
    loadInvitations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfile?.id]);

  const handleAccept = async (invitation: InvitationRow) => {
    if (!userProfile?.id) return;
    setActingId(invitation.id);
    setError(null);

    try {
      const { error: updateError } = await supabase
        .from("tournament_pair_invitations")
        .update({ status: "accepted", responded_at: new Date().toISOString() })
        .eq("id", invitation.id)
        .eq("status", "pending");

      if (updateError) {
        throw updateError;
      }

      const { error: entryError } = await supabase.from("event_entries").insert([
        { event_id: invitation.event_id, pair_id: invitation.pair_id, entry_status: "pending" },
      ]);

      if (entryError && entryError.code !== "23505" && entryError.code !== "PGRST116") {
        throw entryError;
      }

      await ensureTournamentParticipants(
        invitation.tournament_id,
        [invitation.inviter_id, invitation.invitee_id],
        userProfile.id,
      );

      setInvitations(prev => prev.filter(item => item.id !== invitation.id));
      const tournamentName = invitation.tournaments?.name || "the tournament";
      const message = `You have joined ${tournamentName} for ${buildEventLabel(invitation)}.`;
      onHandled?.(message);
    } catch (err: any) {
      console.error("Failed to accept invitation", err);
      setError(err.message || "Unable to accept the invitation.");
    } finally {
      setActingId(null);
    }
  };

  const handleDecline = async (invitation: InvitationRow) => {
    setActingId(invitation.id);
    setError(null);
    try {
      const { error: declineError } = await supabase
        .from("tournament_pair_invitations")
        .update({ status: "declined", responded_at: new Date().toISOString() })
        .eq("id", invitation.id)
        .eq("status", "pending");

      if (declineError) {
        throw declineError;
      }

      setInvitations(prev => prev.filter(item => item.id !== invitation.id));
      const tournamentName = invitation.tournaments?.name || "the tournament";
      const message = `You declined the invitation for ${tournamentName} (${buildEventLabel(invitation)}).`;
      onHandled?.(message);
    } catch (err: any) {
      console.error("Failed to decline invitation", err);
      setError(err.message || "Unable to decline the invitation.");
    } finally {
      setActingId(null);
    }
  };

  if (!userProfile?.id || (!loading && invitations.length === 0 && !error)) {
    return null;
  }

  return (
    <div className="rounded-xl border border-primary-100 bg-primary-50 p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-primary-700">Pending doubles invitations</h2>
        <button
          type="button"
          onClick={loadInvitations}
          className="text-xs font-medium text-primary-600 hover:text-primary-700"
          disabled={loading}
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>
      {error && <div className="mb-3 text-xs text-red-700">{error}</div>}
      {invitations.length === 0 ? (
        <div className="text-xs text-primary-700">No invitations require your response right now.</div>
      ) : (
        <ul className="space-y-3">
          {invitations.map(invitation => {
            const tournamentName = invitation.tournaments?.name || "Tournament";
            const inviterName = invitation.inviter?.full_name || "Your partner";
            return (
              <li key={invitation.id} className="rounded-lg bg-white p-3 shadow-sm">
                <div className="text-sm font-semibold text-gray-900">{tournamentName}</div>
                <div className="text-xs text-gray-600">{buildEventLabel(invitation)}</div>
                <div className="mt-1 text-xs text-gray-600">Invited by {inviterName}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded bg-green-600 px-3 py-1 text-xs font-semibold text-white hover:bg-green-700"
                    onClick={() => handleAccept(invitation)}
                    disabled={actingId === invitation.id}
                  >
                    {actingId === invitation.id ? "Processing..." : "Accept"}
                  </button>
                  <button
                    type="button"
                    className="rounded border border-red-500 px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                    onClick={() => handleDecline(invitation)}
                    disabled={actingId === invitation.id}
                  >
                    Decline
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default PendingPairInvitations;
