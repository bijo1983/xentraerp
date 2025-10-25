import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { useAuthStore } from "../../../store/authStore";
import { ensureTournamentParticipants } from "../utils/ensureTournamentParticipants";

interface RegistrationRow {
  id: string;
  source: "event_entries" | "tournament_registrations";
  status?: string | null;
  created_at?: string | null;
  player?: { id: string; name?: string | null } | null;
  pair?: {
    id: string;
    player1?: { id: string; name?: string | null } | null;
    player2?: { id: string; name?: string | null } | null;
  } | null;
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

const DEFAULT_STATUS_OPTIONS = [
  "pending",
  "accepted",
  "confirmed",
  "checked_in",
  "waitlisted",
  "cancelled",
  "withdrawn",
  "completed",
  "disqualified",
];

type EditContext = {
  row: RegistrationRow;
  eventLabel: string;
};

type PlayerOption = {
  id: string;
  full_name?: string | null;
  email?: string | null;
};

const TournamentRegistrationsPanel: React.FC<Props> = ({ tournamentId }) => {
  const [rows, setRows] = useState<RegistrationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [usingLegacyTable, setUsingLegacyTable] = useState(false);
  const [participantPayments, setParticipantPayments] = useState<Record<string, string>>({});
  const [updatingPaymentId, setUpdatingPaymentId] = useState<string | null>(null);
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null);
  const [editingContext, setEditingContext] = useState<EditContext | null>(null);
  const { userProfile } = useAuthStore();
  const canManagePayments =
    userProfile?.type === "Organizer" || userProfile?.type === "Club" || userProfile?.type === "Administrator";
  const canManageEntries = canManagePayments;
  const actingPlayerId = userProfile?.type === "Player" ? userProfile.id ?? null : null;

  const loadParticipantPayments = async () => {
    const { data, error } = await supabase
      .from("tournament_participants")
      .select("player_id, payment_status")
      .eq("tournament_id", tournamentId);

    if (error) {
      console.error("Failed to load participant payments", error);
      return;
    }

    const map: Record<string, string> = {};
    (data || []).forEach((row: any) => {
      if (row.player_id) {
        map[row.player_id] = row.payment_status || "pending";
      }
    });

    setParticipantPayments(map);
  };

  useEffect(() => {
    const fetchRegistrations = async () => {
      setLoading(true);
      setError(null);
      setUsingLegacyTable(false);

      try {
        const primary = await loadFromEventEntries();
        setRows(primary);
      } catch (primaryError: any) {
        try {
          const fallback = await loadFromTournamentRegistrations();
          setRows(fallback);
          setUsingLegacyTable(true);
        } catch (secondaryError: any) {
          const primaryMessage = primaryError?.message || "";
          const secondaryMessage = secondaryError?.message || "";
          const combined = primaryMessage && secondaryMessage
            ? primaryMessage + " | " + secondaryMessage
            : primaryMessage || secondaryMessage || "Unable to load registrations.";
          setRows([]);
          setError(combined);
        }
      }

      await loadParticipantPayments();

      setLoading(false);
    };

    fetchRegistrations();
  }, [tournamentId]);

  const isMissingColumnError = (err: any, column: string) => {
    if (!err) return false;
    if (err.code === "42703") return true;
    const columnName = column.toLowerCase();
    const message = typeof err.message === "string" ? err.message.toLowerCase() : "";
    const details = typeof err.details === "string" ? err.details.toLowerCase() : "";
    return (
      message.includes(`column ${columnName}`) ||
      message.includes(`column \"${columnName}\"`) ||
      details.includes(`column ${columnName}`)
    );
  };

  const loadFromEventEntries = async (): Promise<RegistrationRow[]> => {
    const { data: eventData, error: eventError } = await supabase
      .from("tournament_events")
      .select("id, event_type, age_group, gender, skill_level")
      .eq("tournament_id", tournamentId);

    if (eventError) {
      throw eventError;
    }

    const eventRows = eventData || [];
    if (!eventRows.length) {
      return [];
    }

    const eventMap = new Map<string, RegistrationRow["event"]>();
    const eventIds: string[] = [];

    eventRows.forEach((event: any) => {
      if (!event?.id) return;
      eventIds.push(event.id);
      eventMap.set(event.id, {
        id: event.id,
        event_type: event.event_type,
        age_group: event.age_group ?? null,
        gender: event.gender ?? null,
        skill_level: event.skill_level ?? null,
      });
    });

    if (!eventIds.length) {
      return [];
    }

    const runEntriesQuery = async (orderColumn: "inserted_at" | "created_at") => {
      const selectedColumns = ["id", "entry_status", "event_id", "player_id", "pair_id"];
      if (orderColumn === "inserted_at") {
        selectedColumns.push("inserted_at", "created_at");
      } else {
        selectedColumns.push("created_at");
      }

      return supabase
        .from("event_entries")
        .select(selectedColumns.join(", "))
        .in("event_id", eventIds)
        .order(orderColumn, { ascending: false });
    };

    let orderColumn: "inserted_at" | "created_at" = "inserted_at";
    let {
      data: entryData,
      error: entryError,
    } = await runEntriesQuery(orderColumn);

    if (entryError && isMissingColumnError(entryError, orderColumn)) {
      orderColumn = "created_at";
      ({ data: entryData, error: entryError } = await runEntriesQuery(orderColumn));
    }

    if (entryError) {
      throw entryError;
    }

    const entries = entryData || [];

    const pairIds = new Set<string>();
    const playerIds = new Set<string>();

    entries.forEach((row: any) => {
      if (row.player_id) {
        playerIds.add(row.player_id);
      }
      if (row.pair_id) {
        pairIds.add(row.pair_id);
      }
    });

    let pairRows: any[] = [];
    if (pairIds.size) {
      const { data: fetchedPairs, error: pairError } = await supabase
        .from("pairs")
        .select("id, player1_id, player2_id")
        .in("id", Array.from(pairIds));

      if (pairError) {
        throw pairError;
      }

      pairRows = fetchedPairs || [];
      pairRows.forEach(pair => {
        if (pair?.player1_id) playerIds.add(pair.player1_id);
        if (pair?.player2_id) playerIds.add(pair.player2_id);
      });
    }

    const playerNameMap = new Map<string, string | null>();
    if (playerIds.size) {
      const { data: playerRows, error: playerError } = await supabase
        .from("player_users")
        .select("id, full_name")
        .in("id", Array.from(playerIds));

      if (playerError) {
        throw playerError;
      }

      (playerRows || []).forEach((player: any) => {
        if (player?.id) {
          playerNameMap.set(player.id, player.full_name ?? null);
        }
      });
    }

    const resolveParticipant = (id?: string | null): { id: string; name?: string | null } | null => {
      if (!id) return null;
      return {
        id,
        name: playerNameMap.get(id) ?? null,
      };
    };

    const pairMap = new Map<string, RegistrationRow["pair"]>();
    pairRows.forEach(pair => {
      if (!pair?.id) return;
      pairMap.set(pair.id, {
        id: pair.id,
        player1: resolveParticipant(pair.player1_id),
        player2: resolveParticipant(pair.player2_id),
      });
    });

    return entries.map((row: any) => {
      const eventId = row.event_id as string | undefined;
      const event = eventId
        ? eventMap.get(eventId) || {
            id: eventId,
            event_type: "",
            age_group: null,
            gender: null,
            skill_level: null,
          }
        : null;

      return {
        id: row.id,
        source: "event_entries",
        status: row.entry_status,
        created_at: row.inserted_at ?? row.created_at ?? null,
        player: resolveParticipant(row.player_id),
        pair: row.pair_id
          ? pairMap.get(row.pair_id) || {
              id: row.pair_id,
              player1: null,
              player2: null,
            }
          : null,
        event,
      };
    });
  };

  const loadFromTournamentRegistrations = async (): Promise<RegistrationRow[]> => {
    const runLegacyQuery = async (orderColumn: "inserted_at" | "created_at") => {
      const columns = ["id", "status", "player_id", "tournament_event_id"];
      if (orderColumn === "inserted_at") {
        columns.push("inserted_at", "created_at");
      } else {
        columns.push("created_at");
      }

      return supabase
        .from("tournament_registrations")
        .select(columns.join(", "))
        .eq("tournament_id", tournamentId)
        .order(orderColumn, { ascending: false });
    };

    let legacyOrder: "inserted_at" | "created_at" = "inserted_at";
    let { data, error: loadError } = await runLegacyQuery(legacyOrder);

    if (loadError && isMissingColumnError(loadError, legacyOrder)) {
      legacyOrder = "created_at";
      ({ data, error: loadError } = await runLegacyQuery(legacyOrder));
    }

    if (loadError) {
      const message = typeof loadError.message === "string" ? loadError.message.toLowerCase() : "";
      if (loadError.code === "42P01" || message.includes("relation \"public.tournament_registrations\" does not exist")) {
        console.warn("tournament_registrations table is not available; falling back to event_entries only.");
        return [];
      }

      throw loadError;
    }

    const registrations = data || [];
    const eventIds = Array.from(
      new Set(
        registrations
          .map((row: any) => row.tournament_event_id)
          .filter((value): value is string => typeof value === "string" && value.length > 0),
      ),
    );
    const playerIds = Array.from(
      new Set(
        registrations
          .map((row: any) => row.player_id)
          .filter((value): value is string => typeof value === "string" && value.length > 0),
      ),
    );

    const eventMap = new Map<string, RegistrationRow["event"]>();
    if (eventIds.length) {
      const { data: events, error: eventsError } = await supabase
        .from("tournament_events")
        .select("id, event_type, age_group, gender, skill_level")
        .in("id", eventIds);

      if (eventsError) {
        console.error("Failed to load event details for legacy registrations", eventsError);
      } else {
        (events || []).forEach((event: any) => {
          if (event?.id) {
            eventMap.set(event.id, {
              id: event.id,
              event_type: event.event_type,
              age_group: event.age_group ?? null,
              gender: event.gender ?? null,
              skill_level: event.skill_level ?? null,
            });
          }
        });
      }
    }

    const playerMap = new Map<string, { id: string; name?: string | null }>();

    if (playerIds.length) {
      const { data: players, error: playerError } = await supabase
        .from("player_users")
        .select("id, full_name")
        .in("id", playerIds);

      if (playerError) {
        console.error("Failed to load player details for legacy registrations", playerError);
      } else {
        (players || []).forEach((player: any) => {
          if (player?.id) {
            playerMap.set(player.id, { id: player.id, name: player.full_name ?? null });
          }
        });
      }
    }

    return registrations.map((row: any) => {
      const eventId = row.tournament_event_id;
      const event = eventId
        ? eventMap.get(eventId) ?? {
            id: eventId,
            event_type: "",
            age_group: null,
            gender: null,
            skill_level: null,
          }
        : null;

      return {
        id: row.id,
        source: "tournament_registrations",
        status: row.status,
        created_at: row.inserted_at ?? row.created_at ?? null,
        player: row.player_id
          ? playerMap.get(row.player_id) || { id: row.player_id, name: null }
          : null,
        pair: null,
        event,
      };
    });
  };
  const buildEventLabel = (event?: RegistrationRow["event"]) => {
    if (!event) return "-";
    const parts: string[] = [];
    if (event.event_type) parts.push(event.event_type);
    if (event.age_group) parts.push(event.age_group);
    if (event.skill_level) parts.push(event.skill_level);
    if (event.gender) parts.push(event.gender);
    return parts.length ? parts.join(" · ") : "-";
  };

  const buildParticipantName = (row: RegistrationRow) => {
    if (row.pair) {
      const names: string[] = [];
      if (row.pair.player1?.name) names.push(row.pair.player1.name);
      if (row.pair.player2?.name) names.push(row.pair.player2.name);
      if (names.length) {
        return names.join(" & ");
      }
      return row.pair.id || "-";
    }
    if (row.player?.name) return row.player.name;
    return row.player?.id || "-";
  };

  const formatDateTime = (value?: string | null) => {
    if (!value) return "-";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleString();
  };

  const eventFilterOptions = useMemo(() => {
    const seen = new Map<string, string>();
    rows.forEach(row => {
      if (row.event?.id && !seen.has(row.event.id)) {
        seen.set(row.event.id, buildEventLabel(row.event));
      }
    });
    return Array.from(seen.entries()).map(([value, label]) => ({ value, label }));
  }, [rows]);

  const statusCounts = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach(row => {
      const key = (row.status || "pending").toLowerCase();
      map.set(key, (map.get(key) || 0) + 1);
    });
    return Array.from(map.entries()).map(([status, count]) => ({ status, count }));
  }, [rows]);

  const uniqueParticipants = useMemo(() => {
    const identifiers = new Set<string>();
    rows.forEach(row => {
      if (row.player?.id) identifiers.add(row.player.id);
      if (row.pair?.player1?.id) identifiers.add(row.pair.player1.id);
      if (row.pair?.player2?.id) identifiers.add(row.pair.player2.id);
    });
    return identifiers.size;
  }, [rows]);

  const filteredRows = useMemo(() => {
    const loweredSearch = searchTerm.trim().toLowerCase();
    return rows.filter(row => {
      if (selectedEventId !== "all" && row.event?.id !== selectedEventId) {
        return false;
      }
      if (!loweredSearch) {
        return true;
      }
      const participant = buildParticipantName(row).toLowerCase();
      const eventLabel = buildEventLabel(row.event).toLowerCase();
      const status = (row.status || "pending").toLowerCase();
      return (
        participant.includes(loweredSearch) ||
        eventLabel.includes(loweredSearch) ||
        status.includes(loweredSearch)
      );
    });
  }, [rows, selectedEventId, searchTerm]);

  const perEventTotals = useMemo(() => {
    const map = new Map<string, { label: string; count: number }>();
    rows.forEach(row => {
      if (!row.event?.id) return;
      const existing = map.get(row.event.id);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(row.event.id, { label: buildEventLabel(row.event), count: 1 });
      }
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [rows]);

  const gatherPlayerIds = (row: RegistrationRow) => {
    const ids = new Set<string>();
    if (row.player?.id) ids.add(row.player.id);
    if (row.pair?.player1?.id) ids.add(row.pair.player1.id);
    if (row.pair?.player2?.id) ids.add(row.pair.player2.id);
    return Array.from(ids);
  };

  const paymentStatusForRow = (row: RegistrationRow) => {
    const ids = gatherPlayerIds(row);
    if (!ids.length) return "pending";
    const statuses = ids.map(id => participantPayments[id] ?? "pending");
    if (statuses.every(status => status === "paid")) return "paid";
    if (statuses.some(status => status === "paid")) return "partial";
    return "pending";
  };

  const paymentBadgeClass = (status: string) => {
    switch (status) {
      case "paid":
        return "bg-green-100 text-green-700";
      case "partial":
        return "bg-amber-100 text-amber-700";
      default:
        return "bg-gray-100 text-gray-600";
    }
  };

  const statusOptions = useMemo(() => {
    const set = new Set<string>(DEFAULT_STATUS_OPTIONS);
    rows.forEach(row => {
      const normalized = (row.status || "").trim().toLowerCase();
      if (normalized) {
        set.add(normalized);
      }
    });
    return Array.from(set).sort();
  }, [rows]);

  const openEditRegistration = (row: RegistrationRow) => {
    setEditingContext({ row, eventLabel: buildEventLabel(row.event) });
  };

  const handleEditSaved = (updatedRow: RegistrationRow, options?: { refreshPayments?: boolean }) => {
    setRows(prev => prev.map(item => (item.id === updatedRow.id ? updatedRow : item)));
    if (options?.refreshPayments) {
      void loadParticipantPayments();
    }
  };

  const handleCloseEditor = () => setEditingContext(null);

  const handleModalSaved = (updatedRow: RegistrationRow, options?: { refreshPayments?: boolean }) => {
    handleEditSaved(updatedRow, options);
    setEditingContext(null);
  };

  const updatePaymentStatus = async (row: RegistrationRow, status: "paid" | "pending") => {
    const playerIds = gatherPlayerIds(row);
    if (!playerIds.length) return;

    setUpdatingPaymentId(row.id);
    const { error: updateError } = await supabase
      .from("tournament_participants")
      .update({ payment_status: status })
      .eq("tournament_id", tournamentId)
      .in("player_id", playerIds);
    setUpdatingPaymentId(null);

    if (updateError) {
      alert("Failed to update payment status: " + updateError.message);
      return;
    }

    setParticipantPayments(prev => {
      const next = { ...prev };
      playerIds.forEach(id => {
        next[id] = status;
      });
      return next;
    });
  };

  const deleteRegistration = async (row: RegistrationRow) => {
    if (!window.confirm("Are you sure you want to delete this registration?")) {
      return;
    }

    setDeletingEntryId(row.id);
    try {
      if (row.source === "event_entries") {
        const { error } = await supabase.from("event_entries").delete().eq("id", row.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("tournament_registrations").delete().eq("id", row.id);
        if (error) throw error;
      }

      setRows(prev => prev.filter(item => item.id !== row.id));
    } catch (err: any) {
      alert(`Failed to delete registration: ${err.message || err}`);
    } finally {
      setDeletingEntryId(null);
    }
  };

  if (loading) {
    return <div className="p-4">Loading registrations...</div>;
  }

  if (error) {
    return <div className="p-4 text-red-600">{error}</div>;
  }

  const totalRegistrations = rows.length;

  return (
    <>
      <div className="space-y-6">
        {usingLegacyTable && (
          <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
            Displaying registrations from the legacy tournament_registrations table.
          </div>
        )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded border bg-white p-4 shadow-sm">
          <div className="text-xs uppercase text-gray-500">Total registrations</div>
          <div className="text-2xl font-semibold text-gray-800">{totalRegistrations}</div>
        </div>
        <div className="rounded border bg-white p-4 shadow-sm">
          <div className="text-xs uppercase text-gray-500">Unique participants</div>
          <div className="text-2xl font-semibold text-gray-800">{uniqueParticipants}</div>
        </div>
        <div className="rounded border bg-white p-4 shadow-sm">
          <div className="text-xs uppercase text-gray-500">Categories configured</div>
          <div className="text-2xl font-semibold text-gray-800">{eventFilterOptions.length}</div>
        </div>
      </div>

      {statusCounts.length > 0 && (
        <div className="rounded border bg-white p-4 shadow-sm">
          <div className="text-sm font-semibold text-gray-700">Status overview</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {statusCounts.map(item => (
              <span
                key={item.status}
                className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700"
              >
                {item.status.charAt(0).toUpperCase() + item.status.slice(1)} · {item.count}
              </span>
            ))}
          </div>
        </div>
      )}

      {perEventTotals.length > 0 && (
        <div className="rounded border bg-white p-4 shadow-sm">
          <div className="text-sm font-semibold text-gray-700">Registrations by category</div>
          <ul className="mt-2 space-y-1 text-sm text-gray-600">
            {perEventTotals.map(item => (
              <li key={item.label} className="flex justify-between">
                <span>{item.label}</span>
                <span>{item.count}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <label className="text-sm font-medium text-gray-700">
          Filter by category
          <select
            value={selectedEventId}
            onChange={event => setSelectedEventId(event.target.value)}
            className="mt-1 block w-full rounded border px-3 py-2"
          >
            <option value="all">All categories</option>
            {eventFilterOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-gray-700">
          Search
          <input
            type="search"
            value={searchTerm}
            onChange={event => setSearchTerm(event.target.value)}
            placeholder="Search by player, pair, or status"
            className="mt-1 block w-full rounded border px-3 py-2"
          />
        </label>
      </div>

      {filteredRows.length === 0 ? (
        <div className="rounded border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600">
          No registrations match the current filters.
        </div>
      ) : (
        <div className="overflow-x-auto rounded border bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left font-semibold text-gray-600">Participant(s)</th>
                <th className="px-4 py-2 text-left font-semibold text-gray-600">Category</th>
                <th className="px-4 py-2 text-left font-semibold text-gray-600">Payment</th>
                <th className="px-4 py-2 text-left font-semibold text-gray-600">Status</th>
                <th className="px-4 py-2 text-left font-semibold text-gray-600">Registered On</th>
                {canManageEntries && (
                  <th className="px-4 py-2 text-left font-semibold text-gray-600">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {filteredRows.map(row => {
                const paymentStatus = paymentStatusForRow(row);
                return (
                  <tr key={row.id}>
                    <td className="px-4 py-2">{buildParticipantName(row)}</td>
                    <td className="px-4 py-2">{buildEventLabel(row.event)}</td>
                    <td className="px-4 py-2">
                      <div className="flex flex-col gap-1">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${paymentBadgeClass(paymentStatus)}`}
                        >
                          {paymentStatus === "paid"
                            ? "Paid"
                            : paymentStatus === "partial"
                            ? "Partially paid"
                            : "Pending"}
                        </span>
                        {canManagePayments && (
                          <button
                            className="self-start text-xs font-medium text-primary-600 hover:text-primary-700"
                            disabled={updatingPaymentId === row.id}
                            onClick={() => updatePaymentStatus(row, paymentStatus === "paid" ? "pending" : "paid")}
                          >
                            {updatingPaymentId === row.id
                              ? "Updating..."
                              : paymentStatus === "paid"
                              ? "Mark as pending"
                              : "Mark as paid"}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2 capitalize">{row.status || "pending"}</td>
                    <td className="px-4 py-2">{formatDateTime(row.created_at)}</td>
                    {canManageEntries && (
                      <td className="px-4 py-2">
                        <div className="flex flex-col gap-1">
                          <button
                            className="text-xs font-medium text-primary-600 hover:text-primary-700"
                            onClick={() => openEditRegistration(row)}
                            disabled={editingContext?.row.id === row.id}
                          >
                            Edit registration
                          </button>
                          <button
                            className="text-xs font-medium text-red-600 hover:text-red-700"
                            onClick={() => deleteRegistration(row)}
                            disabled={deletingEntryId === row.id}
                          >
                            {deletingEntryId === row.id ? "Deleting..." : "Delete"}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div> {/* Close outer container explicitly to match opening <div> */}
      {editingContext && (
        <EditRegistrationModal
          row={editingContext.row}
          eventLabel={editingContext.eventLabel}
          statusOptions={statusOptions}
          onClose={handleCloseEditor}
          onSaved={handleModalSaved}
          tournamentId={tournamentId}
          actingPlayerId={actingPlayerId}
        />
      )}
    </>
  );
};

interface EditRegistrationModalProps {
  row: RegistrationRow;
  eventLabel: string;
  statusOptions: string[];
  onClose: () => void;
  onSaved: (row: RegistrationRow, options?: { refreshPayments?: boolean }) => void;
  tournamentId: string;
  actingPlayerId: string | null;
}

const formatPlayerOption = (option?: PlayerOption | null) =>
  option?.full_name || option?.email || option?.id || "Player not selected";

const toParticipant = (option: PlayerOption | null): { id: string; name?: string | null } | null => {
  if (!option) return null;
  return { id: option.id, name: option.full_name ?? option.email ?? null };
};

const escapeLikePattern = (value: string) => value.replace(/[\\%_]/g, match => `\\${match}`);

const EditRegistrationModal: React.FC<EditRegistrationModalProps> = ({
  row,
  eventLabel,
  statusOptions,
  onClose,
  onSaved,
  tournamentId,
  actingPlayerId,
}) => {
  const [statusDraft, setStatusDraft] = useState<string>((row.status || "pending").toLowerCase());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPairEntry = row.source === "event_entries" && Boolean(row.pair);

  const [playerOne, setPlayerOne] = useState<PlayerOption | null>(
    row.pair?.player1?.id ? { id: row.pair.player1.id, full_name: row.pair.player1.name ?? null } : null,
  );
  const [playerTwo, setPlayerTwo] = useState<PlayerOption | null>(
    row.pair?.player2?.id ? { id: row.pair.player2.id, full_name: row.pair.player2.name ?? null } : null,
  );
  const [playerOneQuery, setPlayerOneQuery] = useState("");
  const [playerTwoQuery, setPlayerTwoQuery] = useState("");
  const [playerOneResults, setPlayerOneResults] = useState<PlayerOption[]>([]);
  const [playerTwoResults, setPlayerTwoResults] = useState<PlayerOption[]>([]);
  const [searchingOne, setSearchingOne] = useState(false);
  const [searchingTwo, setSearchingTwo] = useState(false);

  useEffect(() => {
    if (!isPairEntry) {
      setPlayerOneResults([]);
      setSearchingOne(false);
      return;
    }

    const term = playerOneQuery.trim();
    if (term.length < 2) {
      setPlayerOneResults([]);
      setSearchingOne(false);
      return;
    }

    let active = true;
    const run = async () => {
      setSearchingOne(true);
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
        console.error("Failed to search players", error);
        setPlayerOneResults([]);
      } else {
        const filtered = (data || []).filter((row: any) => row.id && row.id !== playerTwo?.id);
        setPlayerOneResults(filtered as PlayerOption[]);
      }

      setSearchingOne(false);
    };

    void run();

    return () => {
      active = false;
    };
  }, [isPairEntry, playerOneQuery, playerTwo?.id]);

  useEffect(() => {
    if (!isPairEntry) {
      setPlayerTwoResults([]);
      setSearchingTwo(false);
      return;
    }

    const term = playerTwoQuery.trim();
    if (term.length < 2) {
      setPlayerTwoResults([]);
      setSearchingTwo(false);
      return;
    }

    let active = true;
    const run = async () => {
      setSearchingTwo(true);
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
        console.error("Failed to search players", error);
        setPlayerTwoResults([]);
      } else {
        const filtered = (data || []).filter((row: any) => row.id && row.id !== playerOne?.id);
        setPlayerTwoResults(filtered as PlayerOption[]);
      }

      setSearchingTwo(false);
    };

    void run();

    return () => {
      active = false;
    };
  }, [isPairEntry, playerTwoQuery, playerOne?.id]);

  const handleSelectPlayerOne = (option: PlayerOption) => {
    setPlayerOne(option);
    setPlayerOneQuery("");
    setPlayerOneResults([]);
  };

  const handleSelectPlayerTwo = (option: PlayerOption) => {
    setPlayerTwo(option);
    setPlayerTwoQuery("");
    setPlayerTwoResults([]);
  };

  const handleSave = async () => {
    const trimmedStatus = statusDraft.trim().toLowerCase();
    if (!trimmedStatus) {
      setError("Status is required.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const nextRow: RegistrationRow = { ...row, status: trimmedStatus };
      let refreshPayments = false;

      if (row.source === "event_entries") {
        const updates: Record<string, any> = {};
        if (trimmedStatus !== (row.status || "pending").toLowerCase()) {
          updates.entry_status = trimmedStatus;
        }

        if (isPairEntry) {
          const newPlayers = [playerOne?.id, playerTwo?.id].filter((id): id is string => Boolean(id));
          const originalPlayers = [row.pair?.player1?.id, row.pair?.player2?.id].filter(
            (id): id is string => Boolean(id),
          );

          if (newPlayers.length !== 2) {
            throw new Error("Select two different players for this pair.");
          }

          if (newPlayers[0] === newPlayers[1]) {
            throw new Error("Select two different players for this pair.");
          }

          const sortedOriginal = [...originalPlayers].sort();
          const sortedNew = [...newPlayers].sort();
          const membershipChanged =
            sortedOriginal.length !== sortedNew.length ||
            sortedOriginal.some((value, index) => value !== sortedNew[index]);

          let pairId = row.pair?.id ?? null;

          if (membershipChanged || !pairId) {
            const [first, second] = newPlayers;
            const { data: existingPair, error: pairLookupError } = await supabase
              .from("pairs")
              .select("id")
              .or(
                `and(player1_id.eq.${first},player2_id.eq.${second}),and(player1_id.eq.${second},player2_id.eq.${first})`,
              )
              .maybeSingle();

            if (pairLookupError && pairLookupError.code !== "PGRST116") {
              throw pairLookupError;
            }

            pairId = existingPair?.id ?? pairId;

            if (!pairId) {
              const { data: createdPair, error: createPairError } = await supabase
                .from("pairs")
                .insert([{ player1_id: first, player2_id: second }])
                .select("id")
                .single();

              if (createPairError) {
                throw createPairError;
              }

              pairId = createdPair.id;
            }

            if (pairId && pairId !== row.pair?.id) {
              updates.pair_id = pairId;
            }

            refreshPayments = membershipChanged;
            await ensureTournamentParticipants(tournamentId, newPlayers, actingPlayerId ?? null);
          }

          const finalPairId = pairId ?? row.pair?.id ?? null;
          nextRow.pair = finalPairId
            ? {
                id: finalPairId,
                player1: toParticipant(playerOne),
                player2: toParticipant(playerTwo),
              }
            : row.pair;
        }

        if (Object.keys(updates).length) {
          const { error: updateError } = await supabase.from("event_entries").update(updates).eq("id", row.id);
          if (updateError) {
            throw updateError;
          }
        }
      } else if (trimmedStatus !== (row.status || "pending").toLowerCase()) {
        const { error: legacyError } = await supabase
          .from("tournament_registrations")
          .update({ status: trimmedStatus })
          .eq("id", row.id);

        if (legacyError) {
          throw legacyError;
        }
      }

      onSaved(nextRow, { refreshPayments });
    } catch (err: any) {
      console.error("Failed to update registration", err);
      setError(err.message || "Unable to update the registration.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6">
      <div className="w-full max-w-xl rounded-lg bg-white p-6 shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Edit registration</h2>
            <p className="text-sm text-gray-600">{eventLabel}</p>
            {row.player?.name && (
              <p className="text-xs text-gray-500">Primary contact: {row.player.name}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded bg-gray-100 px-2 py-1 text-sm font-medium text-gray-600 hover:bg-gray-200"
          >
            Close
          </button>
        </div>

        <div className="mt-5 space-y-5">
          <label className="block text-sm font-medium text-gray-700">
            Entry status
            <input
              list="registration-status-options"
              className="mt-1 w-full rounded border px-3 py-2 text-sm"
              value={statusDraft}
              onChange={event => setStatusDraft(event.target.value.toLowerCase())}
              placeholder="Enter a status"
              disabled={saving}
            />
            <datalist id="registration-status-options">
              {statusOptions.map(option => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </label>

          {row.source === "event_entries" && !isPairEntry && (
            <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              Pair details are unavailable until both players have been confirmed.
            </div>
          )}

          {isPairEntry && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-800">Update doubles pair</h3>
                <p className="text-xs text-gray-500">
                  Search by name or email to replace either player in this pair. Each partner must be unique.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase text-gray-500">Player 1</div>
                  {playerOne ? (
                    <div className="flex items-center justify-between rounded border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">
                      <span>{formatPlayerOption(playerOne)}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setPlayerOne(null);
                          setPlayerOneQuery("");
                          setPlayerOneResults([]);
                        }}
                        className="font-medium text-green-700 underline"
                      >
                        Change
                      </button>
                    </div>
                  ) : (
                    <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500">
                      Select a player to occupy this slot.
                    </div>
                  )}
                  <input
                    type="search"
                    value={playerOneQuery}
                    onChange={event => setPlayerOneQuery(event.target.value)}
                    placeholder="Search by name or email"
                    className="w-full rounded border px-3 py-2 text-sm"
                    disabled={saving}
                  />
                  {playerOneQuery.trim().length >= 2 && (
                    <div className="max-h-48 overflow-y-auto rounded border border-gray-200 bg-gray-50">
                      {searchingOne ? (
                        <div className="px-3 py-2 text-xs text-gray-500">Searching players...</div>
                      ) : playerOneResults.length ? (
                        <ul>
                          {playerOneResults.map(option => (
                            <li key={option.id}>
                              <button
                                type="button"
                                onClick={() => handleSelectPlayerOne(option)}
                                className="flex w-full flex-col items-start px-3 py-2 text-left text-xs hover:bg-primary-50"
                              >
                                <span className="font-medium text-gray-900">{option.full_name || "Unnamed player"}</span>
                                <span className="text-[11px] text-gray-500">{option.email || option.id}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="px-3 py-2 text-xs text-gray-500">No players match your search.</div>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase text-gray-500">Player 2</div>
                  {playerTwo ? (
                    <div className="flex items-center justify-between rounded border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">
                      <span>{formatPlayerOption(playerTwo)}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setPlayerTwo(null);
                          setPlayerTwoQuery("");
                          setPlayerTwoResults([]);
                        }}
                        className="font-medium text-green-700 underline"
                      >
                        Change
                      </button>
                    </div>
                  ) : (
                    <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500">
                      Select a player to occupy this slot.
                    </div>
                  )}
                  <input
                    type="search"
                    value={playerTwoQuery}
                    onChange={event => setPlayerTwoQuery(event.target.value)}
                    placeholder="Search by name or email"
                    className="w-full rounded border px-3 py-2 text-sm"
                    disabled={saving}
                  />
                  {playerTwoQuery.trim().length >= 2 && (
                    <div className="max-h-48 overflow-y-auto rounded border border-gray-200 bg-gray-50">
                      {searchingTwo ? (
                        <div className="px-3 py-2 text-xs text-gray-500">Searching players...</div>
                      ) : playerTwoResults.length ? (
                        <ul>
                          {playerTwoResults.map(option => (
                            <li key={option.id}>
                              <button
                                type="button"
                                onClick={() => handleSelectPlayerTwo(option)}
                                className="flex w-full flex-col items-start px-3 py-2 text-left text-xs hover:bg-primary-50"
                              >
                                <span className="font-medium text-gray-900">{option.full_name || "Unnamed player"}</span>
                                <span className="text-[11px] text-gray-500">{option.email || option.id}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="px-3 py-2 text-xs text-gray-500">No players match your search.</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {error && <div className="text-sm text-red-600">{error}</div>}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="rounded bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={saving}
          >
            {saving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TournamentRegistrationsPanel;
