// src/components/tournaments/TournamentsList.tsx
import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { Pencil, Trash2, Save, Plus, Loader2, X } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";
import type { UserProfile } from "../../store/authStore";
import PlayerJoinTournaments from "./player/PlayerJoinTournaments";

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
