import React, { useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuthStore } from "../../store/authStore";

type Tournament = {
  id: string;
  name: string;
  currency_code: string;
};

type TournamentEvent = {
  id: string;
  event_type: string;
  age_group?: string;
  gender?: string;
  skill_level?: string;
  registration_fee: number;
};

type Pair = {
  id: string;
  player1_id: string;
  player2_id: string;
};

interface Props {
  event: TournamentEvent;
  tournament: Tournament;
  currency: string;
  onClose: () => void;
}

const EventRegistrationModal: React.FC<Props> = ({ event, tournament, currency, onClose }) => {
  const { userProfile } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [partnerEmail, setPartnerEmail] = useState("");
  const [pairId, setPairId] = useState<string | null>(null);
  const [pairError, setPairError] = useState("");
  const [success, setSuccess] = useState(false);

  // Helper: Register for singles event
  const registerSingles = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.from("event_entries").insert([{
        event_id: event.id,
        player_id: userProfile.id,
        entry_status: "pending",
      }]);
      if (error) throw error;
      setSuccess(true);
    } catch (err: any) {
      setPairError(err.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  // Helper: Register for doubles/mixed event
  const registerDoubles = async () => {
    setLoading(true);
    try {
      if (!pairId) {
        setPairError("Please create or select a pair.");
        setLoading(false);
        return;
      }
      const { error } = await supabase.from("event_entries").insert([{
        event_id: event.id,
        pair_id: pairId,
        entry_status: "pending",
      }]);
      if (error) throw error;
      setSuccess(true);
    } catch (err: any) {
      setPairError(err.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  // Helper: Create new pair (doubles/mixed)
  const handleCreatePair = async () => {
    setPairError("");
    if (!partnerEmail) {
      setPairError("Please enter your partner's email.");
      return;
    }
    setLoading(true);
    try {
      // Find user by email
      const { data: partner, error: userError } = await supabase
        .from("player_users")
        .select("id")
        .eq("email", partnerEmail)
        .single();
      if (userError || !partner) throw new Error("Partner not found");

      // Prevent duplicate
      if (partner.id === userProfile.id) throw new Error("You cannot pair with yourself.");

      // Check if pair exists
      const { data: pair } = await supabase
        .from("pairs")
        .select("id")
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
          .select("id")
          .single();
        if (pairError) throw pairError;
        newPairId = newPair.id;
      }

      setPairId(newPairId);
      setPairError("");
    } catch (err: any) {
      setPairError(err.message || "Could not create pair.");
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
          <div className="text-green-600 font-semibold mb-4">Registration successful!</div>
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
            {pairId && <span className="text-green-700 ml-2">Pair ready!</span>}
            {pairError && <div className="text-red-600 mt-2">{pairError}</div>}
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
          <button
            className="bg-green-600 text-white px-4 py-2 rounded w-full"
            onClick={registerSingles}
            disabled={loading}
          >
            Register as Player
          </button>
        )}
      </div>
    </div>
  );
};

export default EventRegistrationModal;
