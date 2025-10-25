import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuthStore } from "../../store/authStore";
import { ensureTournamentParticipants } from "./utils/ensureTournamentParticipants";

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

type PlayerSearchResult = {
  id: string;
  full_name?: string | null;
  email?: string | null;
};

interface Props {
  event: TournamentEvent;
  tournament: Tournament;
  currency: string;
  onClose: () => void;
  onSuccess?: (options?: { message?: string }) => void;
}

const EventRegistrationModal: React.FC<Props> = ({ event, tournament, currency, onClose, onSuccess }) => {
  const { userProfile } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [emailStatus, setEmailStatus] = useState<string | null>(null);
  const [partnerQuery, setPartnerQuery] = useState("");
  const [partnerResults, setPartnerResults] = useState<PlayerSearchResult[]>([]);
  const [selectedPartner, setSelectedPartner] = useState<PlayerSearchResult | null>(null);
  const [searchingPartner, setSearchingPartner] = useState(false);
  const [successTitle, setSuccessTitle] = useState("Registration successful!");
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

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

  const assertUniqueCategoryEntry = async (playerIds: string[]) => {
    const uniquePlayerIds = Array.from(new Set(playerIds.filter(Boolean)));
    if (!uniquePlayerIds.length) {
      return;
    }

    const { data: existingEntries, error: existingEntriesError } = await supabase
      .from("event_entries")
      .select("id, player_id, pair_id")
      .eq("event_id", event.id);

    if (existingEntriesError) {
      throw existingEntriesError;
    }

    const entries = existingEntries ?? [];
    const pairIds = entries
      .map(entry => entry.pair_id)
      .filter((id): id is string => Boolean(id));

    const uniquePairIds = Array.from(new Set(pairIds));
    const pairMembersMap = new Map<
      string,
      { player1_id: string | null; player2_id: string | null }
    >();

    if (uniquePairIds.length) {
      const { data: pairRows, error: pairError } = await supabase
        .from("pairs")
        .select("id, player1_id, player2_id")
        .in("id", uniquePairIds);

      if (pairError) {
        throw pairError;
      }

      (pairRows || []).forEach(pair => {
        if (pair?.id) {
          pairMembersMap.set(pair.id, {
            player1_id: pair.player1_id ?? null,
            player2_id: pair.player2_id ?? null,
          });
        }
      });
    }

    const hasConflict = entries.some(entry => {
      if (entry.player_id && uniquePlayerIds.includes(entry.player_id)) {
        return true;
      }

      if (entry.pair_id) {
        const pair = pairMembersMap.get(entry.pair_id);
        if (!pair) {
          return false;
        }

        return [pair.player1_id, pair.player2_id].some(
          memberId => memberId && uniquePlayerIds.includes(memberId)
        );
      }

      return false;
    });

    if (hasConflict) {
      throw new Error(`You already have a registration for ${eventLabel}.`);
    }
  };

  const resolvePairMembers = async (id: string) => {
    if (pairMembers.length) {
      return [...pairMembers];
    }

    const { data: pairInfo, error } = await supabase
      .from("pairs")
      .select("player1_id, player2_id")
      .eq("id", id)
      .maybeSingle();

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

    if (!pairInfo) {
      return [] as string[];
    }

    const members = [pairInfo.player1_id, pairInfo.player2_id].filter(Boolean) as string[];
    setPairMembers(members);
    return [...members];
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
        : "Registration completed. We were unable to send a confirmation email automatically.",
    );
  };

  const handleRegistrationSuccess = async (playerIds: string[]) => {
    await ensureTournamentParticipants(tournament.id, playerIds, userProfile?.id ?? null);
    await sendConfirmationEmail();
    setSuccessTitle("Registration successful!");
    setSuccessMessage(
      "Please pay the tournament entry fee at the tournament counter. The organizer will mark your payment as paid once it has been received.",
    );
    setSuccess(true);
    onSuccess?.();
  };

  const registerSingles = async () => {
    setErrorMessage("");
    setLoading(true);
    try {
      setEmailStatus(null);
      setSuccess(false);
      setSuccessMessage(null);
      setSuccessTitle("Registration successful!");
      if (!userProfile?.id) {
        throw new Error("Unable to determine your player profile.");
      }

      await assertUniqueCategoryEntry([userProfile.id]);

      const { error } = await supabase.from("event_entries").insert([
        {
          event_id: event.id,
          player_id: userProfile.id,
          entry_status: "pending",
        },
      ]);
      if (error) throw error;
      await handleRegistrationSuccess([userProfile.id]);
    } catch (err: any) {
      setErrorMessage(err.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  const registerDoubles = async () => {
    setErrorMessage("");
    setLoading(true);
    try {
      setEmailStatus(null);
      setSuccess(false);
      setSuccessMessage(null);
      setSuccessTitle("Invitation sent!");
      if (!userProfile?.id) {
        throw new Error("Unable to determine your player profile.");
      }
      if (!selectedPartner) {
        throw new Error("Please select your doubles partner.");
      }
      if (selectedPartner.id === userProfile.id) {
        throw new Error("You cannot pair with yourself.");
      }

      const partnerId = selectedPartner.id;

      const { data: existingPair, error: pairLookupError } = await supabase
        .from("pairs")
        .select("id")
        .or(
          `and(player1_id.eq.${userProfile.id},player2_id.eq.${partnerId}),and(player1_id.eq.${partnerId},player2_id.eq.${userProfile.id})`,
        )
        .maybeSingle();

      if (pairLookupError) {
        throw pairLookupError;
      }

      let pairId = existingPair?.id ?? null;
      if (!pairId) {
        const { data: createdPair, error: createPairError } = await supabase
          .from("pairs")
          .insert([{ player1_id: userProfile.id, player2_id: partnerId }])
          .select("id")
          .single();

        if (createPairError) {
          throw createPairError;
        }

        pairId = createdPair.id;
      }

      if (!pairId) {
        throw new Error("Unable to determine the pair for this registration.");
      }

      const { data: existingEntry, error: entryLookupError } = await supabase
        .from("event_entries")
        .select("id")
        .eq("event_id", event.id)
        .eq("pair_id", pairId)
        .maybeSingle();

      if (entryLookupError && entryLookupError.code !== "PGRST116") {
        throw entryLookupError;
      }

      if (existingEntry) {
        throw new Error("This pair is already registered for this category.");
      }

      const { data: existingInvite, error: inviteLookupError } = await supabase
        .from("tournament_pair_invitations")
        .select("id, status")
        .eq("event_id", event.id)
        .eq("pair_id", pairId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (inviteLookupError && inviteLookupError.code !== "PGRST116") {
        throw inviteLookupError;
      }

      if (existingInvite) {
        const status = (existingInvite.status || "").toLowerCase();
        if (status === "pending") {
          throw new Error("An invitation for this pair is already awaiting a response.");
        }
        if (status === "accepted") {
          throw new Error("This pair has already been registered after a previous invitation.");
        }
      }

      const { error: createInviteError } = await supabase
        .from("tournament_pair_invitations")
        .insert({
          tournament_id: tournament.id,
          event_id: event.id,
          pair_id: pairId,
          inviter_id: userProfile.id,
          invitee_id: partnerId,
        });

      if (createInviteError) {
        throw createInviteError;
      }

      const partnerLabel = selectedPartner.full_name || selectedPartner.email || "your partner";
      setSuccessTitle("Invitation sent!");
      setSuccessMessage(
        `We've notified ${partnerLabel}. They must accept the invitation before your registration is confirmed.`,
      );
      setEmailStatus("You will see the confirmed registration once your partner accepts the invitation.");
      setSuccess(true);
      onSuccess?.({ message: `Invitation sent to ${partnerLabel} for ${eventLabel}.` });
      const members = await resolvePairMembers(pairId);
      await assertUniqueCategoryEntry(members);

      const { error } = await supabase.from("event_entries").insert([
        {
          event_id: event.id,
          pair_id: pairId,
          entry_status: "pending",
        },
      ]);
      if (error) throw error;
      const fallbackIds = members.length
        ? members
        : ([userProfile?.id].filter(Boolean) as string[]);
      await handleRegistrationSuccess(fallbackIds);
    } catch (err: any) {
      setErrorMessage(err.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  const escapeLikePattern = (value: string) => value.replace(/[\\%_]/g, match => `\\${match}`);

  useEffect(() => {
    const term = partnerQuery.trim();
    if (term.length < 2) {
      setPartnerResults([]);
      setSearchingPartner(false);
      return;
    }

    let active = true;
    const runSearch = async () => {
      setSearchingPartner(true);
      const escaped = escapeLikePattern(term);
      const pattern = `%${escaped}%`;

      const { data, error } = await supabase
        .from("player_users")
        .select("id, full_name, email")
        .or(`full_name.ilike.${pattern},email.ilike.${pattern}`)
        .limit(10);

      if (!active) {
        return;
      }

      if (error) {
        console.error("Failed to search partner players", error);
        setPartnerResults([]);
      } else {
        const filtered = (data || []).filter(row => row.id && row.id !== userProfile?.id);
        setPartnerResults(filtered as PlayerSearchResult[]);
      }

      setSearchingPartner(false);
    };

    runSearch();

    return () => {
      active = false;
    };
  }, [partnerQuery, userProfile?.id]);

  const handleSelectPartner = (partner: PlayerSearchResult) => {
    setSelectedPartner(partner);
    setPartnerQuery(partner.full_name || partner.email || "");
    setPartnerResults([]);
  };

  const handleClearPartner = () => {
    setSelectedPartner(null);
    setPartnerQuery("");
    setPartnerResults([]);
  };

  const isDoubles = ["doubles", "mixed"].includes(event.event_type.toLowerCase());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl p-6 shadow max-w-lg w-full relative">
        <button onClick={onClose} className="absolute top-3 right-3 text-gray-400 hover:text-black text-lg">
          &times;
        </button>
        <h2 className="text-xl font-bold mb-2">Register for {event.event_type} Event</h2>
        <div className="mb-4">
          <div>
            <b>Fee:</b> {currency} {event.registration_fee}
          </div>
          <div>
            <b>Category:</b> {event.age_group || "-"}, {event.gender || "-"}, {event.skill_level || "-"}
          </div>
        </div>

        {success ? (
          <div className="space-y-3">
            <div className="text-green-600 font-semibold">{successTitle}</div>
            {successMessage && <div className="text-sm text-gray-700">{successMessage}</div>}
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
            <label className="block mb-2 font-medium">Search for your partner</label>
            <input
              type="text"
              value={partnerQuery}
              onChange={event => {
                setPartnerQuery(event.target.value);
                setSelectedPartner(null);
              }}
              placeholder="Start typing a name or email"
              className="w-full border rounded p-2 mb-2"
              disabled={loading}
            />
            {selectedPartner && (
              <div className="mb-2 flex items-center justify-between rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
                <span>Selected partner: {selectedPartner.full_name || selectedPartner.email || selectedPartner.id}</span>
                <button type="button" onClick={handleClearPartner} className="text-xs font-medium underline">
                  Change
                </button>
              </div>
            )}
            {!selectedPartner && partnerQuery.trim().length >= 2 && (
              <div className="mb-2 rounded border border-gray-200 bg-gray-50">
                {searchingPartner ? (
                  <div className="px-3 py-2 text-sm text-gray-500">Searching players...</div>
                ) : partnerResults.length ? (
                  <ul className="max-h-48 overflow-y-auto">
                    {partnerResults.map(result => (
                      <li key={result.id}>
                        <button
                          type="button"
                          onClick={() => handleSelectPartner(result)}
                          className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-primary-50"
                        >
                          <span className="font-medium text-gray-900">{result.full_name || "Unnamed player"}</span>
                          <span className="text-xs text-gray-500">{result.email || "No email"}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="px-3 py-2 text-sm text-gray-500">No players match your search yet.</div>
                )}
              </div>
            )}
            {errorMessage && <div className="text-red-600 mt-2">{errorMessage}</div>}
            <button
              type="button"
              className="bg-green-600 text-white px-4 py-2 rounded mt-4 w-full"
              onClick={registerDoubles}
              disabled={loading || !selectedPartner}
            >
              Send Invitation
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
