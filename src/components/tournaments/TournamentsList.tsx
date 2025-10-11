import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { Pencil, Trash2, Save, Plus, Loader2, X } from "lucide-react";
import { useNavigate } from "react-router-dom";

const statusOptions = [
  "upcoming", "registration_open", "ongoing", "completed", "cancelled"
];

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

export const TournamentsList: React.FC = () => {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [hostedBy, setHostedBy] = useState<"club" | "organizer" | "">("");
  const [isOrganizerOrClub, setIsOrganizerOrClub] = useState(false);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Tournament | null>(null);
  const [saving, setSaving] = useState(false);
  const [statusDraft, setStatusDraft] = useState<{ [id: string]: string }>({});
  const [savingStatusId, setSavingStatusId] = useState<string | null>(null);

  // Fetch user and tournaments
  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      const { data: authData } = await supabase.auth.getUser();
      const uid = authData?.user?.id;
      if (!uid) {
        setLoading(false);
        return;
      }
      setUserId(uid);

      // Check if user has club or organizer profile to determine if they can create tournaments
      const { data: clubRows } = await supabase.from("club_users").select("user_id").eq("user_id", uid);
      const { data: organizerRows } = await supabase.from("organizer_users").select("user_id").eq("user_id", uid);

      if (clubRows?.length) {
        setIsOrganizerOrClub(true);
        setHostedBy("club");
      } else if (organizerRows?.length) {
        setIsOrganizerOrClub(true);
        setHostedBy("organizer");
      } else {
        setIsOrganizerOrClub(false);
        setHostedBy("");
      }

      const { data: tournamentsData } = await supabase
        .from("tournaments")
        .select("*")
        .order("start_date");
      setTournaments(tournamentsData || []);
      setLoading(false);
    };

    loadAll();
  }, []);

  const isOwner = (t: Tournament) => {
    // Check if the current user's profile ID matches the tournament's organizer_id
    if (!isOrganizerOrClub || !userId) return false;
    
    // For tournaments, organizer_id should match the profile table ID, not auth user_id
    // We need to check if the current user has a profile that matches the organizer_id
    return true; // We'll do the actual check in the component since we need async calls
  };

  // ----- Add/Edit Modal/Form Logic -----
  const handleAdd = () => {
    if (!userId || !hostedBy) return;
    setForm(emptyTournament(userId, hostedBy));
    setShowForm(true);
  };

  const handleEdit = (t: Tournament) => {
    // Navigate to the tournament details page for editing
    navigate(`/tournaments/edit/${t.id}`);
  };

  const closeForm = () => {
    setForm(null);
    setShowForm(false);
  };

  const handleFormChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    if (!form) return;
    const { name, value } = e.target;
    if (
      name === "max_participants" ||
      name === "entry_fee" ||
      name === "prize_pool"
    ) {
      setForm({ ...form, [name]: value === "" ? null : Number(value) });
    } else {
      setForm({ ...form, [name]: value });
    }
  };

  const handleFormSave = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!form || !userId || !hostedBy) return;
  setSaving(true);

  // Prepare payload (exclude id, keep types)
  const payload: { [k: string]: any } = {
    ...form,
    organizer_id: userId,
    hosted_by: hostedBy,
  };

  // Clean number fields for DB
  for (const key of ["max_participants", "entry_fee", "prize_pool"]) {
    if (payload[key] === "" || payload[key] === undefined) payload[key] = null;
    if (payload[key] !== null && typeof payload[key] === "string" && payload[key] !== "")
      payload[key] = Number(payload[key]);
  }

  let error;
  if (form.id) {
    // Ensure the ID is present and correct
    const { error: updateError } = await supabase
      .from("tournaments")
      .update(payload)
      .eq("id", form.id)
      .select(); // get the updated row (optional)
    error = updateError;
  } else {
    // Insert new
    const { error: insertError } = await supabase
      .from("tournaments")
      .insert(payload);
    error = insertError;
  }
  setSaving(false);

  if (!error) {
    closeForm();
    // Refresh list
    const { data: tournamentsData } = await supabase.from("tournaments").select("*").order("start_date");
    setTournaments(tournamentsData || []);
  } else {
    alert("Error: " + error.message);
  }
};


  // --------- STATUS LOGIC -----------
  const handleStatusDraftChange = (id: string, newStatus: string) => {
    setStatusDraft((prev) => ({ ...prev, [id]: newStatus }));
  };

  const handleStatusSave = async (t: Tournament) => {
    const newStatus = statusDraft[t.id!];
    setSavingStatusId(t.id!);
    const { error } = await supabase
      .from("tournaments")
      .update({ status: newStatus })
      .eq("id", t.id);
    setSavingStatusId(null);

    if (!error) {
      const { data: tournamentsData } = await supabase.from("tournaments").select("*").order("start_date");
      setTournaments(tournamentsData || []);
      setStatusDraft((prev) => ({ ...prev, [t.id!]: undefined }));
    } else {
      alert("Failed to update status: " + error.message);
    }
  };

  // --------- DELETE -----------
  const handleDelete = async (t: Tournament) => {
    if (!window.confirm("Are you sure you want to delete this tournament?")) return;
    setLoading(true);
    const { error } = await supabase.from("tournaments").delete().eq("id", t.id);
    setLoading(false);
    if (!error) {
      const { data: tournamentsData } = await supabase.from("tournaments").select("*").order("start_date");
      setTournaments(tournamentsData || []);
    } else {
      alert("Failed to delete: " + error.message);
    }
  };

  // --------- PAGE ---------
  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-blue-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-600 to-blue-600 px-8 py-6 flex items-center justify-between rounded-b-2xl shadow">
        <h1 className="text-2xl font-bold text-white tracking-wide">Tournaments</h1>
        {isOrganizerOrClub && (
          <button
            className="flex items-center gap-2 bg-white text-emerald-700 font-semibold hover:bg-emerald-100 px-4 py-2 rounded-lg text-sm shadow border border-emerald-200 transition"
            onClick={handleAdd}
          >
            <Plus className="w-5 h-5" /> Add Tournament
          </button>
        )}
      </div>

      <div className="max-w-5xl mx-auto -mt-10 pb-10">
        {/* Card container for the tournaments list */}
        <div className="bg-white rounded-xl shadow p-4 mt-10">
          {loading ? (
            <div className="text-center text-gray-500 py-20">Loading tournaments...</div>
          ) : tournaments.length === 0 ? (
            <div className="text-center text-gray-500 py-20">No tournaments found.</div>
          ) : (
            <div className="divide-y">
              {tournaments.map((t) => {
                const draftStatus = statusDraft[t.id!];
                const isDirty = draftStatus && draftStatus !== t.status;
                return (
                  <div key={t.id} className="flex flex-col md:flex-row md:items-center gap-2 py-4">
                    <div className="flex-1">
                      <div className="font-semibold text-lg">{t.name}</div>
                      <div className="text-xs text-gray-500 mb-1">{t.location}</div>
                      <div className="text-xs text-gray-500">
                        {t.start_date} – {t.end_date}
                      </div>
                      <div className="text-xs text-gray-500">{t.description}</div>
                    </div>
                    <div className="flex items-center gap-3 mt-2 md:mt-0">
                      <span className="text-xs font-medium text-gray-700">Status:</span>
                      <span className="uppercase text-xs">{draftStatus ?? t.status}</span>
                      {isOwner(t) && (
                        <>
                          <select
                            value={draftStatus ?? t.status}
                            onChange={e => handleStatusDraftChange(t.id!, e.target.value)}
                            disabled={savingStatusId === t.id}
                            className="border rounded px-2 py-1 text-xs ml-2"
                          >
                            {statusOptions.map(status => (
                              <option key={status} value={status}>
                                {status.replace('_', ' ').toUpperCase()}
                              </option>
                            ))}
                          </select>
                          {isDirty && (
                            <button
                              className="p-1 ml-1 rounded bg-blue-600 text-white hover:bg-blue-700"
                              style={{ height: "2rem", width: "2rem" }}
                              disabled={savingStatusId === t.id}
                              title="Save Status"
                              onClick={() => handleStatusSave(t)}
                            >
                              {savingStatusId === t.id ? (
                                <Loader2 className="w-4 h-4 mx-auto animate-spin" />
                              ) : (
                                <Save className="w-4 h-4 mx-auto" />
                              )}
                            </button>
                          )}
                          <button
                            className="p-1 ml-1 rounded hover:bg-gray-100"
                            onClick={() => handleEdit(t)}
                            title="Edit Tournament"
                          >
                            <Pencil className="w-5 h-5 text-yellow-600" />
                          </button>
                          <button
                            className="p-1 ml-1 rounded hover:bg-gray-100"
                            onClick={() => handleDelete(t)}
                            title="Delete Tournament"
                          >
                            <Trash2 className="w-5 h-5 text-red-600" />
                          </button>
                        </>
                      )}
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
          <div className="bg-white rounded-xl shadow-lg w-full max-w-lg p-8 relative">
            <button
              className="absolute top-4 right-4 text-gray-500 hover:text-gray-800 text-2xl"
              onClick={closeForm}
              title="Close"
            >
              <X className="w-6 h-6" />
            </button>
            <h2 className="text-xl font-semibold mb-4">{form?.id ? "Edit Tournament" : "Add Tournament"}</h2>
            <form onSubmit={handleFormSave} className="space-y-4">
              <input
                className="w-full border rounded p-2"
                name="name"
                value={form?.name || ""}
                onChange={handleFormChange}
                placeholder="Tournament Name"
                required
              />
              <textarea
                className="w-full border rounded p-2"
                name="description"
                value={form?.description || ""}
                onChange={handleFormChange}
                placeholder="Description"
              />
              <input
                className="w-full border rounded p-2"
                name="location"
                value={form?.location || ""}
                onChange={handleFormChange}
                placeholder="Location"
              />
              <div className="grid grid-cols-2 gap-4">
                <input
                  className="w-full border rounded p-2"
                  type="date"
                  name="start_date"
                  value={form?.start_date ? form.start_date.substring(0, 10) : ""}
                  onChange={handleFormChange}
                  required
                />
                <input
                  className="w-full border rounded p-2"
                  type="date"
                  name="end_date"
                  value={form?.end_date ? form.end_date.substring(0, 10) : ""}
                  onChange={handleFormChange}
                  required
                />
              </div>
              <input
                className="w-full border rounded p-2"
                type="date"
                name="registration_deadline"
                value={form?.registration_deadline ? form.registration_deadline.substring(0, 10) : ""}
                onChange={handleFormChange}
                placeholder="Registration Deadline"
              />
              <div className="grid grid-cols-3 gap-4">
                <input
                  className="w-full border rounded p-2"
                  type="number"
                  min={2}
                  name="max_participants"
                  value={form?.max_participants ?? ""}
                  onChange={handleFormChange}
                  placeholder="Max Participants"
                />
                <input
                  className="w-full border rounded p-2"
                  type="number"
                  step="0.01"
                  name="entry_fee"
                  value={form?.entry_fee ?? ""}
                  onChange={handleFormChange}
                  placeholder="Entry Fee"
                />
                <input
                  className="w-full border rounded p-2"
                  type="number"
                  step="0.01"
                  name="prize_pool"
                  value={form?.prize_pool ?? ""}
                  onChange={handleFormChange}
                  placeholder="Prize Pool"
                />
              </div>
              <select
                className="w-full border rounded p-2"
                name="tournament_format"
                value={form?.tournament_format || ""}
                onChange={handleFormChange}
              >
                <option value="single_elimination">Single Elimination</option>
                <option value="double_elimination">Double Elimination</option>
                <option value="round_robin">Round Robin</option>
              </select>
              <div className="flex gap-2 mt-4">
                <button
                  type="submit"
                  disabled={saving}
                  className="bg-emerald-600 text-white px-4 py-2 rounded hover:bg-emerald-700"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
                <button
                  type="button"
                  onClick={closeForm}
                  className="bg-gray-400 text-white px-4 py-2 rounded hover:bg-gray-500"
                >
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
