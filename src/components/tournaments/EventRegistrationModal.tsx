import React, { useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuthStore } from "../../store/authStore";

type Tournament = {
  id: string;
  name: string;
  currency_code: string;
  start_date: string;
  end_date: string;
};

type RegistrationEmailPayload = {
  to_email: string;
  player_name: string;
  tournament_name: string;
  event_label: string;
  amount_due: number;
  currency_code: string;
  start_date: string;
  end_date: string;
};

type TournamentEvent = {
  id: string;
  event_type: string;
  age_group?: string;
  gender?: string;
  skill_level?: string;
  registration_fee: number;
};

interface Props {
  event: TournamentEvent;
  tournament: Tournament;
  currency: string;
  onClose: () => void;
  onSuccess?: () => void;
}

const EventRegistrationModal: React.FC<Props> = ({ event, tournament, currency, onClose, onSuccess }) => {
  const { userProfile } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [partnerEmail, setPartnerEmail] = useState("");
  const [pairId, setPairId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [pairMembers, setPairMembers] = useState<string[]>([]);
  const [partnerName, setPartnerName] = useState<string>("");
  const [emailStatus, setEmailStatus] = useState<string | null>(null);

  const eventLabel = useMemo(() => {
    const parts: string[] = [event.event_type];
    if (event.age_group) parts.push(event.age_group);
    if (event.skill_level) parts.push(event.skill_level);
    if (event.gender) parts.push(event.gender);
    return parts.filter(Boolean).join(" · ");
  }, [event]);

  const ensureParticipants = async (playerIds: string[]) => {
    const unique = Array.from(new Set(playerIds.filter(Boolean)));
    if (!unique.length) return;

    const rows = unique.map(playerId => ({
      tournament_id: tournament.id,
      player_id: playerId,
      payment_status: "pending" as const,
    }));

    const { error } = await supabase
      .from("tournament_participants")
      .upsert(rows, { onConflict: "tournament_id,player_id" });

    if (!error) {
      return;
    }

    const errorWithStatus = error as { status?: number };
    const normalizedMessage = error.message?.toLowerCase() || "";
    const isRowSecurityError =
      error.code === "42501" ||
      error.code === "PGRST301" ||
      normalizedMessage.includes("row-level security") ||
      normalizedMessage.includes("not authorized") ||
      errorWithStatus.status === 403;

    if (!isRowSecurityError) {
      throw error;
    }

    console.warn("Limited permissions prevented registering all participants", error);

    const ownRows = rows.filter(row => row.player_id === userProfile?.id);
    if (!ownRows.length) {
      return;
    }

    const { error: fallbackError } = await supabase
      .from("tournament_participants")
      .upsert(ownRows, { onConflict: "tournament_id,player_id" });

    const fallbackErrorWithStatus = fallbackError as { status?: number } | null;
    if (
      fallbackError &&
      fallbackError.code !== "42501" &&
      fallbackError.code !== "PGRST301" &&
      fallbackErrorWithStatus?.status !== 403
    ) {
      throw fallbackError;
    }
  };

  const triggerRegistrationEmailRpc = async (payload: RegistrationEmailPayload) => {
    const { error } = await supabase.rpc("send_tournament_registration_email", payload);
    if (error) {
      throw error;
    }
  };

  const triggerRegistrationEmailFallback = async (payload: RegistrationEmailPayload) => {
    await supabase.functions.invoke("send-tournament-registration-email", { body: payload });
  };

  const sendConfirmationEmail = async () => {
    if (!userProfile?.email) {
      setEmailStatus("Registration completed. Please update your profile email to receive confirmations.");
      return;
    }

    const payload: RegistrationEmailPayload = {
      to_email: userProfile.email,
      player_name: userProfile.name || userProfile.email,
      tournament_name: tournament.name,
      event_label: eventLabel,
      amount_due: event.registration_fee ?? 0,
      currency_code: currency,
      start_date: tournament.start_date,
      end_date: tournament.end_date,
    };

    let delivered = false;

    try {
      await triggerRegistrationEmailRpc(payload);
      delivered = true;
    } catch (rpcError) {
      console.warn("send_tournament_registration_email RPC failed", rpcError);

      try {
        await triggerRegistrationEmailFallback(payload);
        delivered = true;
      } catch (funcError) {
        console.warn("send-tournament-registration-email function failed", funcError);
      }
    }

    setEmailStatus(
      delivered
        ? `Confirmation email sent to ${userProfile.email}.`
        : "Registration completed. We were unable to send a confirmation email automatically."
    );
  };

  const handleRegistrationSuccess = async (playerIds: string[]) => {
    await ensureParticipants(playerIds);
    await sendConfirmationEmail();
    setSuccess(true);
    onSuccess?.();
  };

  // Helper: Register for singles event
  const registerSingles = async () => {
    setErrorMessage("");
    setLoading(true);
    try {
      setEmailStatus(null);
      if (!userProfile?.id) {
        throw new Error("Unable to determine your player profile.");
      }

      const { error } = await supabase.from("event_entries").insert([{
        event_id: event.id,
        player_id: userProfile.id,
        entry_status: "pending",
      }]);
      if (error) throw error;
      await handleRegistrationSuccess([userProfile.id]);
    } catch (err: any) {
      setErrorMessage(err.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  // Helper: Register for doubles/mixed event
  const registerDoubles = async () => {
    setErrorMessage("");
    setLoading(true);
    try {
      setEmailStatus(null);
      if (!pairId) {
        setErrorMessage("Please create or select a pair.");
        setLoading(false);
        return;
      }
      const { error } = await supabase.from("event_entries").insert([{
        event_id: event.id,
        pair_id: pairId,
        entry_status: "pending",
      }]);
      if (error) throw error;
      let playerIds = pairMembers;
      if (!playerIds.length) {
        const { data: pairInfo } = await supabase
          .from("pairs")
          .select("player1_id, player2_id")
          .eq("id", pairId)
          .maybeSingle();
        if (pairInfo) {
          playerIds = [pairInfo.player1_id, pairInfo.player2_id].filter(Boolean) as string[];
        }
      }
      const fallbackIds = playerIds.length ? playerIds : [userProfile?.id].filter(Boolean) as string[];
      await handleRegistrationSuccess(fallbackIds);
    } catch (err: any) {
      setErrorMessage(err.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  // Helper: Create new pair (doubles/mixed)
  const handleCreatePair = async () => {
    setErrorMessage("");
    if (!partnerEmail) {
      setErrorMessage("Please enter your partner's email.");
      return;
    }
    setLoading(true);
    try {
      // Find user by email
      const { data: partner, error: userError } = await supabase
        .from("player_users")
        .select("id, full_name")
        .eq("email", partnerEmail)
        .single();
      if (userError || !partner) throw new Error("Partner not found");

      // Prevent duplicate
      if (partner.id === userProfile.id) throw new Error("You cannot pair with yourself.");

      // Check if pair exists
      const { data: pair } = await supabase
        .from("pairs")
        .select("id, player1_id, player2_id")
        .or(
          `and(player1_id.eq.${userProfile.id},player2_id.eq.${partner.id}),and(player1_id.eq.${partner.id},player2_id.eq.${userProfile.id})`
        )
        .maybeSingle();

      let newPairId = pair?.id;
      if (!newPairId) {
        // Create pair if doesn't exist
        const { data: newPair, error: pairError } = await supabase
          .from("pairs")
          .insert([{ player1_id: userProfile.id, player2_id: partner.id }])
          .select("id, player1_id, player2_id")
          .single();
        if (pairError) throw pairError;
        newPairId = newPair.id;
        setPairMembers([newPair.player1_id, newPair.player2_id]);
      } else {
        setPairMembers([pair.player1_id, pair.player2_id]);
      }

      setPairId(newPairId);
      setPartnerName(partner.full_name ?? partnerEmail);
      setErrorMessage("");
    } catch (err: any) {
      setErrorMessage(err.message || "Could not create pair.");
    } finally {
      setLoading(false);
    }
  };

  // UI logic
  const isDoubles = ["doubles", "mixed"].includes(event.event_type.toLowerCase());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl p-6 shadow max-w-lg w-full relative">
        <button onClick={onClose} className="absolute top-3 right-3 text-gray-400 hover:text-black text-lg">&times;</button>
        <h2 className="text-xl font-bold mb-2">Register for {event.event_type} Event</h2>
        <div className="mb-4">
          <div><b>Fee:</b> {currency} {event.registration_fee}</div>
          <div><b>Category:</b> {event.age_group || "-"}, {event.gender || "-"}, {event.skill_level || "-"}</div>
        </div>

        {success ? (
          <div className="space-y-3">
            <div className="text-green-600 font-semibold">Registration successful!</div>
            <div className="text-sm text-gray-700">
              Please pay the tournament entry fee at the tournament counter. The organizer will mark your payment as paid once it has been received.
            </div>
            {emailStatus && <div className="text-sm text-gray-600">{emailStatus}</div>}
            <button
              className="mt-2 w-full rounded bg-primary-500 px-4 py-2 text-white hover:bg-primary-600"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        ) : isDoubles ? (
          <>
            <label className="block mb-2 font-medium">Partner Email</label>
            <input
              type="email"
              value={partnerEmail}
              onChange={e => setPartnerEmail(e.target.value)}
              placeholder="Enter partner's email"
              className="w-full border rounded p-2 mb-2"
            />
            <button
              type="button"
              onClick={handleCreatePair}
              className="bg-blue-500 text-white px-4 py-2 rounded mr-2"
              disabled={loading}
            >
              Find/Create Pair
            </button>
            {pairId && (
              <span className="text-green-700 ml-2">Pair ready{partnerName ? ` with ${partnerName}` : ""}!</span>
            )}
            {errorMessage && <div className="text-red-600 mt-2">{errorMessage}</div>}
            <button
              type="button"
              className="bg-green-600 text-white px-4 py-2 rounded mt-4 w-full"
              onClick={registerDoubles}
              disabled={loading || !pairId}
            >
              Register as Pair
            </button>
          </>
        ) : (
          <>
            <button
              className="bg-green-600 text-white px-4 py-2 rounded w-full"
              onClick={registerSingles}
              disabled={loading}
            >
              Register as Player
            </button>
            {errorMessage && <div className="text-red-600 mt-2">{errorMessage}</div>}
          </>
        )}
      </div>
    </div>
  );
};

export default EventRegistrationModal;
