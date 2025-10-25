// src/components/tournaments/TournamentsList.tsx
import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { Pencil, Trash2, Save, Plus, Loader2, X } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";
import type { UserProfile } from "../../store/authStore";
import PlayerJoinTournaments from "./player/PlayerJoinTournaments";
import EventRegistrationModal from "./EventRegistrationModal";
import PendingPairInvitations from "./PendingPairInvitations";

const statusOptions = ["upcoming","registration_open","ongoing","completed","cancelled"] as const;

type Tournament = {
  id?: string;
  name: string;
  description: string;
  start_date: string;
  end_date: string;
  currency_code: string;
  status: string;
  organizer_id: string;
  hosted_by: string;
  location?: string;
  max_participants?: number | null;
  entry_fee?: number | null;
  prize_pool?: number | null;
  tournament_format?: string;
  registration_deadline?: string;
};

const emptyTournament = (organizerId: string, hosted_by: string): Tournament => ({
  name: "",
  description: "",
  start_date: "",
  end_date: "",
  registration_deadline: "",
  max_participants: null,
  entry_fee: null,
  prize_pool: null,
  tournament_format: "single_elimination",
  currency_code: "BHD",
  status: "upcoming",
  organizer_id: organizerId,
  hosted_by,
  location: "",
});

type CountryRow = {
  id: string;
  name: string;
  code?: string | null;
  currency_code?: string | null;
};

type PublicTournament = {
  id: string;
  name: string;
  description?: string | null;
  start_date: string;
  end_date: string;
  registration_deadline?: string | null;
  location?: string | null;
  hosted_by: "club" | "organizer";
  organizer_id: string;
  currency_code?: string | null;
  host_name?: string | null;
  country_id?: string | null;
};

type TournamentEventSummary = {
  id: string;
  event_type: string;
  age_group?: string | null;
  gender?: string | null;
  skill_level?: string | null;
  registration_fee: number | null;
  max_entries?: number | null;
};

const formatDate = (value?: string | null) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString();
};

const formatEventLabel = (event: TournamentEventSummary) => {
  const parts = [event.event_type];
  if (event.age_group) parts.push(event.age_group);
  if (event.skill_level) parts.push(event.skill_level);
  if (event.gender) parts.push(event.gender);
  return parts.filter(Boolean).join(" · ");
};

const JoinTournamentsView: React.FC<{ userCountryId?: string | null }> = ({ userCountryId }) => {
  const [countries, setCountries] = useState<CountryRow[]>([]);
  const [countriesLoading, setCountriesLoading] = useState(false);
  const [allTournaments, setAllTournaments] = useState<PublicTournament[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<string>("");
  const [filteredTournaments, setFilteredTournaments] = useState<PublicTournament[]>([]);
  const [selectedTournament, setSelectedTournament] = useState<PublicTournament | null>(null);
  const [events, setEvents] = useState<TournamentEventSummary[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [modalEvent, setModalEvent] = useState<TournamentEventSummary | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [countryInitialized, setCountryInitialized] = useState(false);
  const { userProfile } = useAuthStore();

  const countryMap = useMemo(() => {
    const map = new Map<string, CountryRow>();
    countries.forEach(country => {
      map.set(country.id, country);
    });
    return map;
  }, [countries]);

  const resolvedCurrency = useMemo(() => {
    if (!selectedTournament) return "USD";
    const direct = selectedTournament.currency_code;
    if (direct) return direct;
    if (selectedTournament.country_id) {
      return countryMap.get(selectedTournament.country_id)?.currency_code || "USD";
    }
    return "USD";
  }, [selectedTournament, countryMap]);

  useEffect(() => {
    const fetchCountries = async () => {
      setCountriesLoading(true);
      const { data, error } = await supabase
        .from("countries")
        .select("id, name, code, currency_code")
        .order("name");

      if (error) {
        console.error("Failed to load countries", error);
      }

      setCountries(data || []);
      setCountriesLoading(false);
    };

    const loadOpenTournaments = async () => {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from("tournaments")
        .select("id, name, description, location, start_date, end_date, registration_deadline, status, hosted_by, organizer_id, currency_code")
        .eq("status", "registration_open")
        .order("start_date", { ascending: true });

      if (error) {
        console.error("Failed to load tournaments", error);
        setError("Unable to load open tournaments. Please try again later.");
        setAllTournaments([]);
        setLoading(false);
        return;
      }

      const tournaments = (data || []) as any[];
      const clubIds = Array.from(new Set(tournaments.filter(t => t.hosted_by === "club").map(t => t.organizer_id))).filter(Boolean);
      const organizerIds = Array.from(new Set(tournaments.filter(t => t.hosted_by === "organizer").map(t => t.organizer_id))).filter(Boolean);

      const clubPromise = clubIds.length
        ? supabase
            .from("club_users")
            .select("id, club_name, country_id")
            .in("id", clubIds)
        : Promise.resolve({ data: [] as any[], error: null });

      const organizerPromise = organizerIds.length
        ? supabase
            .from("organizer_users")
            .select("id, organizer_name, country_id")
            .in("id", organizerIds)
        : Promise.resolve({ data: [] as any[], error: null });

      const [clubRes, organizerRes] = await Promise.all([clubPromise, organizerPromise]);

      if (clubRes.error) {
        console.error("Failed to load club hosts", clubRes.error);
      }
      if (organizerRes.error) {
        console.error("Failed to load organizer hosts", organizerRes.error);
      }

      const clubMap = new Map<string, any>();
      (clubRes.data || []).forEach((row: any) => clubMap.set(row.id, row));

      const organizerMap = new Map<string, any>();
      (organizerRes.data || []).forEach((row: any) => organizerMap.set(row.id, row));

      const enriched: PublicTournament[] = tournaments.map(t => {
        const host = t.hosted_by === "club" ? clubMap.get(t.organizer_id) : organizerMap.get(t.organizer_id);
        return {
          id: t.id,
          name: t.name,
          description: t.description,
          location: t.location,
          start_date: t.start_date,
          end_date: t.end_date,
          registration_deadline: t.registration_deadline,
          hosted_by: t.hosted_by,
          organizer_id: t.organizer_id,
          currency_code: t.currency_code,
          host_name:
            host?.club_name ??
            host?.organizer_name ??
            null,
          country_id: host?.country_id ?? null,
        };
      });

      setAllTournaments(enriched);
      setLoading(false);
    };

    fetchCountries();
    loadOpenTournaments();
  }, []);

  useEffect(() => {
    if (!countries.length || countryInitialized) return;

    if (userCountryId) {
      setSelectedCountry(userCountryId);
    } else {
      setSelectedCountry("");
    }

    setCountryInitialized(true);
  }, [countries, userCountryId, countryInitialized]);

  useEffect(() => {
    const nextList = selectedCountry
      ? allTournaments.filter(
          tournament => tournament.country_id === selectedCountry || !tournament.country_id,
        )
      : allTournaments;

    setFilteredTournaments(nextList);

    if (!selectedTournament || !nextList.some(t => t.id === selectedTournament.id)) {
      setSelectedTournament(nextList[0] ?? null);
    }
  }, [selectedCountry, allTournaments, selectedTournament]);

  useEffect(() => {
    if (!selectedTournament) {
      setEvents([]);
      setEventsError(null);
      return;
    }

    const loadEvents = async () => {
      setEventsLoading(true);
      setEventsError(null);
      const { data, error } = await supabase
        .from("tournament_events")
        .select("id, event_type, age_group, gender, skill_level, registration_fee, max_entries")
        .eq("tournament_id", selectedTournament.id)
        .order("event_type", { ascending: true });

      if (error) {
        console.error("Failed to load tournament events", error);
        setEvents([]);
        setEventsError("Unable to load categories for this tournament.");
      } else {
        setEvents((data || []) as TournamentEventSummary[]);
      }

      setEventsLoading(false);
    };

    setSuccessMessage(null);
    loadEvents();
  }, [selectedTournament]);

  const handleOpenRegistration = (event: TournamentEventSummary) => {
    setModalEvent(event);
  };

  const handleModalClose = () => {
    setModalEvent(null);
  };

  const handleRegistrationSuccess = (
    event: TournamentEventSummary,
    options?: { message?: string },
  ) => {
    if (options?.message) {
      setSuccessMessage(options.message);
      return;
    }

    setSuccessMessage(`You have registered for ${formatEventLabel(event)}. Check your email for confirmation.`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-background-tint to-secondary-50">
      <div className="max-w-6xl mx-auto py-10 px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-text-primary">Join a Tournament</h1>
          <p className="text-sm text-text-secondary mt-2">
            Browse active tournaments and register for your preferred category. Complete your payment at the tournament
            counter so the organizer can mark it as paid.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <div className="space-y-6 md:col-span-1">
            {userProfile?.type === "Player" && (
              <PendingPairInvitations onHandled={message => setSuccessMessage(message)} />
            )}
            <div className="bg-background rounded-xl shadow p-4">
              <label className="block text-sm font-medium text-text-secondary mb-2">Select Country</label>
              <select
                className="w-full border rounded px-3 py-2 text-sm"
                value={selectedCountry}
                onChange={e => setSelectedCountry(e.target.value)}
                disabled={countriesLoading}
              >
                {countriesLoading && <option>Loading...</option>}
                {!countriesLoading && (
                  <>
                    <option value="">All countries</option>
                    {countries.length === 0 ? (
                      <option disabled>No countries available</option>
                    ) : (
                      countries.map(country => (
                        <option key={country.id} value={country.id}>
                          {country.name}
                        </option>
                      ))
                    )}
                  </>
                )}
              </select>
            </div>

            <div className="bg-background rounded-xl shadow p-4">
              <h2 className="text-lg font-semibold text-text-primary mb-3">Open Tournaments</h2>
              {loading ? (
                <div className="text-sm text-text-secondary">Loading tournaments...</div>
              ) : error ? (
                <div className="text-sm text-red-600">{error}</div>
              ) : filteredTournaments.length === 0 ? (
                <div className="text-sm text-text-secondary">No open tournaments in this country.</div>
              ) : (
                <ul className="space-y-2">
                  {filteredTournaments.map(tournament => {
                    const isActive = selectedTournament?.id === tournament.id;
                    return (
                      <li key={tournament.id}>
                        <button
                          onClick={() => setSelectedTournament(tournament)}
                          className={`w-full text-left rounded-lg border px-3 py-2 text-sm transition ${
                            isActive
                              ? "border-primary-300 bg-primary-50 text-primary-700"
                              : "border-transparent bg-background-subtle hover:bg-background"
                          }`}
                        >
                          <div className="font-semibold">{tournament.name}</div>
                          <div className="text-xs text-text-secondary">
                            {formatDate(tournament.start_date)} – {formatDate(tournament.end_date)}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          <div className="md:col-span-2">
            {selectedTournament ? (
              <div className="bg-background rounded-xl shadow p-6 space-y-4">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-bold text-text-primary">{selectedTournament.name}</h2>
                    <div className="text-sm text-text-secondary mt-1">
                      {selectedTournament.location || "Location to be announced"}
                    </div>
                    {selectedTournament.host_name && (
                      <div className="text-xs text-text-secondary mt-1">Hosted by {selectedTournament.host_name}</div>
                    )}
                    {selectedTournament.registration_deadline && (
                      <div className="text-xs text-text-secondary mt-1">
                        Registration closes {formatDate(selectedTournament.registration_deadline)}
                      </div>
                    )}
                  </div>
                  <div className="text-right text-sm text-text-secondary">
                    <div>
                      {formatDate(selectedTournament.start_date)} – {formatDate(selectedTournament.end_date)}
                    </div>
                    {selectedTournament.country_id && (
                      <div>{countryMap.get(selectedTournament.country_id)?.name}</div>
                    )}
                    <div className="font-semibold text-text-primary mt-1">Currency: {resolvedCurrency}</div>
                  </div>
                </div>

                {selectedTournament.description && (
                  <p className="text-sm text-text-secondary">{selectedTournament.description}</p>
                )}

                {successMessage && (
                  <div className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
                    {successMessage}
                  </div>
                )}

                <div>
                  <h3 className="text-lg font-semibold text-text-primary mb-3">Available Categories</h3>
                  {eventsLoading ? (
                    <div className="text-sm text-text-secondary">Loading categories...</div>
                  ) : eventsError ? (
                    <div className="text-sm text-red-600">{eventsError}</div>
                  ) : events.length === 0 ? (
                    <div className="text-sm text-text-secondary">No categories have been published yet.</div>
                  ) : (
                    <div className="space-y-3">
                      {events.map(event => (
                        <div
                          key={event.id}
                          className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 rounded-lg border border-background-subtle bg-background-subtle px-4 py-3"
                        >
                          <div>
                            <div className="font-medium text-text-primary">{formatEventLabel(event)}</div>
                            <div className="text-xs text-text-secondary">
                              Fee: {resolvedCurrency} {event.registration_fee ?? 0}
                              {event.max_entries ? ` · Max entries: ${event.max_entries}` : ""}
                            </div>
                          </div>
                          <button
                            className="self-start md:self-auto rounded bg-primary-500 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-600"
                            onClick={() => handleOpenRegistration(event)}
                          >
                            Register
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-background rounded-xl shadow p-6 text-sm text-text-secondary">
                Select a tournament to view details and available categories.
              </div>
            )}
          </div>
        </div>
      </div>

      {modalEvent && selectedTournament && (
        <EventRegistrationModal
          event={modalEvent}
          tournament={{
            id: selectedTournament.id,
            name: selectedTournament.name,
            currency_code: resolvedCurrency,
            start_date: selectedTournament.start_date,
            end_date: selectedTournament.end_date,
          }}
          currency={resolvedCurrency}
          onClose={handleModalClose}
          onSuccess={details => handleRegistrationSuccess(modalEvent, details)}
        />
      )}
    </div>
  );
};

const ManageTournamentsView: React.FC<{ userProfile: UserProfile }> = ({ userProfile }) => {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [hostedBy, setHostedBy] = useState<"club"|"organizer"| "">("");
  const [isOrganizerOrClub, setIsOrganizerOrClub] = useState(false);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Tournament | null>(null);
  const [saving, setSaving] = useState(false);
  const [statusDraft, setStatusDraft] = useState<{ [id: string]: string }>({});
  const [savingStatusId, setSavingStatusId] = useState<string | null>(null);

  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      const { data: authData } = await supabase.auth.getUser();
      const uid = authData?.user?.id ?? null;
      setUserId(uid);

      if (uid) {
        const { data: clubRows } = await supabase.from("club_users").select("user_id").eq("user_id", uid);
        const { data: organizerRows } = await supabase.from("organizer_users").select("user_id").eq("user_id", uid);
        if (clubRows?.length) { setIsOrganizerOrClub(true); setHostedBy("club"); }
        else if (organizerRows?.length) { setIsOrganizerOrClub(true); setHostedBy("organizer"); }
        else { setIsOrganizerOrClub(false); setHostedBy(""); }
      }

      const { data: tournamentsData } = await supabase.from("tournaments").select("*").order("start_date");
      setTournaments(tournamentsData || []);
      setLoading(false);
    };
    loadAll();
  }, []);

  const isOwner = (t: Tournament) =>
    Boolean(isOrganizerOrClub && userId && t.organizer_id === userId);

  const handleAdd = () => {
    if (!userId || !hostedBy) return;
    setForm(emptyTournament(userId, hostedBy));
    setShowForm(true);
  };

  const handleEdit = (t: Tournament) => navigate(`/tournaments/edit/${t.id}`);

  const closeForm = () => { setForm(null); setShowForm(false); };

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    if (!form) return;
    const { name, value } = e.target;
    if (["max_participants","entry_fee","prize_pool"].includes(name))
      setForm({ ...form, [name]: value === "" ? null : Number(value) });
    else setForm({ ...form, [name]: value });
  };

  const handleFormSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form || !userId || !hostedBy) return;
    setSaving(true);

    const payload: Record<string, any> = { ...form, organizer_id: userId, hosted_by: hostedBy };
    for (const k of ["max_participants","entry_fee","prize_pool"]) {
      if (payload[k] === "" || payload[k] === undefined) payload[k] = null;
      if (payload[k] !== null && typeof payload[k] === "string" && payload[k] !== "") payload[k] = Number(payload[k]);
    }

    let error;
    if (form.id) {
      const { error: updateError } = await supabase.from("tournaments").update(payload).eq("id", form.id).select();
      error = updateError;
    } else {
      const { error: insertError } = await supabase.from("tournaments").insert(payload);
      error = insertError;
    }
    setSaving(false);

    if (!error) {
      closeForm();
      const { data } = await supabase.from("tournaments").select("*").order("start_date");
      setTournaments(data || []);
    } else {
      alert("Error: " + error.message);
    }
  };

  const handleStatusDraftChange = (id: string, newStatus: string) =>
    setStatusDraft((prev) => ({ ...prev, [id]: newStatus }));

  const handleStatusSave = async (t: Tournament) => {
    const newStatus = statusDraft[t.id!];
    setSavingStatusId(t.id!);
    const { error } = await supabase.from("tournaments").update({ status: newStatus }).eq("id", t.id);
    setSavingStatusId(null);

    if (!error) {
      const { data } = await supabase.from("tournaments").select("*").order("start_date");
      setTournaments(data || []);
      setStatusDraft((prev) => ({ ...prev, [t.id!]: undefined as any }));
    } else {
      alert("Failed to update status: " + error.message);
    }
  };

  const handleDelete = async (t: Tournament) => {
    if (!window.confirm("Delete this tournament?")) return;
    setLoading(true);
    const { error } = await supabase.from("tournaments").delete().eq("id", t.id);
    setLoading(false);
    if (!error) {
      const { data } = await supabase.from("tournaments").select("*").order("start_date");
      setTournaments(data || []);
    } else {
      alert("Failed to delete: " + error.message);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-background-tint to-secondary-50">
      <div className="bg-gradient-to-r from-primary-500 via-primary-400 to-secondary-500 px-8 py-6 flex items-center justify-between rounded-b-2xl shadow">
        <h1 className="text-2xl font-bold text-white tracking-wide">Tournaments</h1>
        {(userProfile?.type === "Club" || userProfile?.type === "Organizer") && (
          <button
            className="flex items-center gap-2 bg-background text-primary-600 font-semibold hover:bg-primary-50 hover:text-primary-700 px-4 py-2 rounded-lg text-sm shadow border border-primary-200 transition"
            onClick={handleAdd}
          >
            <Plus className="w-5 h-5" /> Add Tournament
          </button>
        )}
      </div>

      <div className="max-w-5xl mx-auto -mt-10 pb-10">
        <div className="bg-background rounded-xl shadow p-4 mt-10">
          {loading ? (
            <div className="text-center text-text-secondary py-20">Loading tournaments...</div>
          ) : tournaments.length === 0 ? (
            <div className="text-center text-text-secondary py-20">No tournaments found.</div>
          ) : (
            <div className="divide-y">
              {tournaments.map((t) => {
                const draftStatus = statusDraft[t.id!];
                const isDirty = draftStatus && draftStatus !== t.status;
                const owner = isOwner(t);

                return (
                  <div key={t.id} className="flex flex-col md:flex-row md:items-center gap-2 py-4">
                    <div className="flex-1">
                      <div className="font-semibold text-lg text-text-primary">{t.name}</div>
                      <div className="text-xs text-text-secondary mb-1">{t.location}</div>
                      <div className="text-xs text-text-secondary">{t.start_date} – {t.end_date}</div>
                      <div className="text-xs text-text-secondary">{t.description}</div>
                    </div>

                    <div className="flex items-center gap-3 mt-2 md:mt-0">
                      <span className="text-xs font-medium text-text-secondary">Status:</span>
                      <span className="uppercase text-xs text-text-primary">{draftStatus ?? t.status}</span>

                      {owner && (
                        <>
                          <select
                            value={draftStatus ?? t.status}
                            onChange={e => handleStatusDraftChange(t.id!, e.target.value)}
                            disabled={savingStatusId === t.id}
                            className="border rounded px-2 py-1 text-xs ml-2"
                          >
                            {statusOptions.map(s => (
                              <option key={s} value={s}>{s.replace('_',' ').toUpperCase()}</option>
                            ))}
                          </select>
                          {isDirty && (
                            <button
                              className="p-1 ml-1 rounded bg-secondary-500 text-white hover:bg-secondary-600"
                              style={{ height: "2rem", width: "2rem" }}
                              disabled={savingStatusId === t.id}
                              title="Save Status"
                              onClick={() => handleStatusSave(t)}
                            >
                              {savingStatusId === t.id ? <Loader2 className="w-4 h-4 mx-auto animate-spin" /> : <Save className="w-4 h-4 mx-auto" />}
                            </button>
                          )}
                          <button className="p-1 ml-1 rounded hover:bg-background-subtle" onClick={() => handleEdit(t)} title="Edit Tournament">
                            <Pencil className="w-5 h-5 text-accent-500" />
                          </button>
                          <button className="p-1 ml-1 rounded hover:bg-background-subtle" onClick={() => handleDelete(t)} title="Delete Tournament">
                            <Trash2 className="w-5 h-5 text-red-600" />
                          </button>
                        </>
                      )}

                      {/* Manage (Control Center) */}
                      <Link
                        to={`/tournaments/${t.id}`}
                        className="ml-2 border rounded px-3 py-1 text-xs hover:bg-background-subtle"
                        aria-label={`Manage ${t.name}`}
                        title="Open Tournament Control Center"
                      >
                        Manage
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-background rounded-xl shadow-lg w-full max-w-lg p-8 relative">
            <button className="absolute top-4 right-4 text-text-secondary hover:text-text-primary text-2xl" onClick={closeForm} title="Close">
              <X className="w-6 h-6" />
            </button>
            <h2 className="text-xl font-semibold mb-4 text-text-primary">{form?.id ? "Edit Tournament" : "Add Tournament"}</h2>
            <form onSubmit={handleFormSave} className="space-y-4">
              <input className="w-full border rounded p-2" name="name" value={form?.name || ""} onChange={handleFormChange} placeholder="Tournament Name" required />
              <textarea className="w-full border rounded p-2" name="description" value={form?.description || ""} onChange={handleFormChange} placeholder="Description" />
              <input className="w-full border rounded p-2" name="location" value={form?.location || ""} onChange={handleFormChange} placeholder="Location" />
              <div className="grid grid-cols-2 gap-4">
                <input className="w-full border rounded p-2" type="date" name="start_date" value={form?.start_date ? form.start_date.substring(0,10) : ""} onChange={handleFormChange} required />
                <input className="w-full border rounded p-2" type="date" name="end_date" value={form?.end_date ? form.end_date.substring(0,10) : ""} onChange={handleFormChange} required />
              </div>
              <input className="w-full border rounded p-2" type="date" name="registration_deadline" value={form?.registration_deadline ? form.registration_deadline.substring(0,10) : ""} onChange={handleFormChange} placeholder="Registration Deadline" />
              <div className="grid grid-cols-3 gap-4">
                <input className="w-full border rounded p-2" type="number" min={2} name="max_participants" value={form?.max_participants ?? ""} onChange={handleFormChange} placeholder="Max Participants" />
                <input className="w-full border rounded p-2" type="number" step="0.01" name="entry_fee" value={form?.entry_fee ?? ""} onChange={handleFormChange} placeholder="Entry Fee" />
                <input className="w-full border rounded p-2" type="number" step="0.01" name="prize_pool" value={form?.prize_pool ?? ""} onChange={handleFormChange} placeholder="Prize Pool" />
              </div>
              <select className="w-full border rounded p-2" name="tournament_format" value={form?.tournament_format || ""} onChange={handleFormChange}>
                <option value="single_elimination">Single Elimination</option>
                <option value="double_elimination">Double Elimination</option>
                <option value="round_robin">Round Robin</option>
              </select>
              <div className="flex gap-2 mt-4">
                <button type="submit" disabled={saving} className="bg-primary-500 text-white px-4 py-2 rounded hover:bg-primary-600 transition-colors">
                  {saving ? "Saving..." : "Save"}
                </button>
                <button type="button" onClick={closeForm} className="border border-background-subtle bg-background-subtle text-text-primary px-4 py-2 rounded hover:bg-background">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export const TournamentsList: React.FC = () => {
  const { userProfile } = useAuthStore();

  if (!userProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 via-background-tint to-secondary-50">
        <div className="text-sm text-text-secondary">Loading tournaments...</div>
      </div>
    );
  }

  if (userProfile.type === "Player" || userProfile.type === "Group") {
    return <PlayerJoinTournaments />;
  }

  return <ManageTournamentsView userProfile={userProfile} />;
};
