// src/components/tournaments/tournamentdetails.tsx
import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAuthStore } from "../../store/authStore";
import TournamentCategoriesPanel from "./modules/TournamentCategoriesPanel";
import TournamentFixturesPanel from "./modules/TournamentFixturesPanel";
import TournamentRegistrationsPanel from "./modules/TournamentRegistrationsPanel";
import TournamentScoreInputPanel from "./modules/TournamentScoreInputPanel";
import TournamentResultsReviewPanel from "./modules/TournamentResultsReviewPanel";

type ModuleKey = "overview" | "categories" | "fixtures" | "registrations" | "scores" | "results";

interface Tournament {
  id: string;
  name: string;
  description?: string;
  location?: string;
  start_date: string;
  end_date: string;
  registration_deadline?: string;
  max_participants?: number | null;
  entry_fee?: number | null;
  default_registration_fee?: number | null;
  prize_pool?: number | null;
  tournament_format?: string;
  currency_code?: string | null;
  status?: string;
  organizer_id: string;
  hosted_by: "club" | "organizer";
}

const TournamentDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, userProfile } = useAuthStore();

  const [form, setForm] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const isAdmin = userProfile?.type === "Administrator";
  const [activeModule, setActiveModule] = useState<ModuleKey>("overview");

  useEffect(() => {
    const fetchTournament = async () => {
      if (!id) return;
      setLoading(true);
      setError(null);
      const { data, error } = await supabase.from("tournaments").select("*").eq("id", id).maybeSingle();
      setLoading(false);
      if (error) { setError(error.message); return; }
      if (!data) { setError("Tournament not found"); return; }
      setForm(data as Tournament);
      setIsOwner((data as Tournament).organizer_id === user?.id);
    };
    fetchTournament();
  }, [id, user?.id]);

  const handleOverviewSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    const { error } = await supabase.from("tournaments").update(form).eq("id", form.id);
    setSaving(false);
    if (error) { setError(error.message); return; }
    setSuccess("Saved successfully");
    setTimeout(() => setSuccess(null), 2000);
  };

  const moduleButtons = [
    { id: "overview",       label: "Overview",         description: "Edit title, dates, status", roles: ["Administrator","Club","Organizer"] },
    { id: "categories",     label: "Categories",       description: "Add event presets & fine-tune entries", roles: ["Administrator","Club","Organizer"] },
    { id: "fixtures",       label: "Fixtures",         description: "Inspect generated draws", roles: ["Administrator","Club","Organizer"] },
    { id: "registrations",  label: "Registrations",    description: "Review sign-ups per division", roles: ["Administrator","Club","Organizer","Player","Group"] },
    { id: "scores",         label: "Score Input",      description: "Capture live results", roles: ["Administrator","Club","Organizer"] },
    { id: "results",        label: "Results Review",   description: "Confirm champions", roles: ["Administrator","Club","Organizer"] },
  ] as const;

  const canSee = (button: (typeof moduleButtons)[number]) =>
    button.roles.includes(userProfile?.type as any);

  const renderOverview = () => {
    if (!form) return null;
    const readOnly = !(isOwner || isAdmin);
    return (
      <form className="space-y-4" onSubmit={handleOverviewSave}>
        <div className="grid md:grid-cols-2 gap-4">
          <input
            className="w-full border rounded p-2"
            value={form.name || ""}
            onChange={e => setForm({ ...form, name: e.target.value })}
            placeholder="Tournament Name"
            disabled={readOnly}
          />
          <input
            className="w-full border rounded p-2"
            value={form.location || ""}
            onChange={e => setForm({ ...form, location: e.target.value })}
            placeholder="Location"
            disabled={readOnly}
          />
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          <input
            className="w-full border rounded p-2"
            type="date"
            value={form.start_date?.substring(0,10) || ""}
            onChange={e => setForm({ ...form, start_date: e.target.value })}
            disabled={readOnly}
          />
          <input
            className="w-full border rounded p-2"
            type="date"
            value={form.end_date?.substring(0,10) || ""}
            onChange={e => setForm({ ...form, end_date: e.target.value })}
            disabled={readOnly}
          />
          <select
            className="w-full border rounded p-2"
            value={form.status ?? "upcoming"}
            onChange={e => setForm({ ...form, status: e.target.value })}
            disabled={readOnly}
          >
            <option value="upcoming">Upcoming</option>
            <option value="registration_open">Registration Open</option>
            <option value="ongoing">Ongoing</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        <textarea
          className="w-full border rounded p-2"
          placeholder="Description"
          value={form.description || ""}
          onChange={e => setForm({ ...form, description: e.target.value })}
          disabled={readOnly}
        />
        {(isOwner || isAdmin) && (
          <button
            type="submit"
            disabled={saving}
            className="rounded bg-primary-500 px-4 py-2 text-white hover:bg-primary-600"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        )}
        <button
          type="button"
          onClick={() => navigate("/tournaments")}
          className="ml-2 rounded border border-background-subtle bg-background-subtle px-4 py-2 text-text-primary hover:bg-background"
        >
          Back to Tournaments
        </button>
      </form>
    );
  };

  const renderActiveModule = () => {
    if (!form) return null;
    switch (activeModule) {
      case "overview":
        return (isOwner || isAdmin) ? renderOverview() : (
          <div className="text-sm text-gray-600">Overview (read-only)</div>
        );
      case "categories":
        return (isOwner || isAdmin)
          ? (
              <TournamentCategoriesPanel
                tournament={{
                  id: form.id,
                  name: form.name,
                  currency_code: form.currency_code,
                  entry_fee: form.entry_fee ?? null,
                  default_registration_fee: form.default_registration_fee ?? null,
                }}
              />
            )
          : <div className="text-sm text-gray-600">Only organizers/administrators can manage categories.</div>;
      case "fixtures":
        return (isOwner || isAdmin)
          ? <TournamentFixturesPanel tournamentId={form.id} />
          : <div className="text-sm text-gray-600">Only organizers/administrators can view fixtures here.</div>;
      case "registrations":
        return <TournamentRegistrationsPanel tournamentId={form.id} />;
      case "scores":
        return (isOwner || isAdmin)
          ? <TournamentScoreInputPanel tournamentId={form.id} />
          : <div className="text-sm text-gray-600">Only organizers/administrators can input scores.</div>;
      case "results":
        return (isOwner || isAdmin)
          ? <TournamentResultsReviewPanel tournamentId={form.id} />
          : <div className="text-sm text-gray-600">Only organizers/administrators can confirm results.</div>;
      default:
        return null;
    }
  };

  if (loading) return <div className="p-6">Loading…</div>;
  if (error) return <div className="p-6 text-red-600">{error}</div>;
  if (!form) return <div className="p-6">Not found.</div>;

  return (
    <div className="space-y-6 p-8">
      <div className="rounded border border-blue-200 bg-blue-50 p-4">
        <h1 className="text-2xl font-bold text-blue-900">Tournament Control Center</h1>
        <p className="mt-1 text-sm text-blue-700">
          Manage categories, fixtures, registrations, live scoring, and results from a single action menu.
        </p>
      </div>

      {success && <div className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{success}</div>}
      {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <nav>
        <div className="grid md:grid-cols-3 gap-3">
          {moduleButtons.filter(canSee).map((button) => (
            <button
              key={button.id}
              onClick={() => setActiveModule(button.id as ModuleKey)}
              className={`rounded border p-3 text-left transition ${
                activeModule === (button.id as ModuleKey)
                  ? 'border-primary-300 bg-primary-50'
                  : 'border-gray-200 bg-white hover:bg-gray-50'
              }`}
            >
              <div className="font-semibold">{button.label}</div>
              <div className="text-xs text-gray-600">{button.description}</div>
            </button>
          ))}
        </div>
      </nav>

      <section className="rounded border border-gray-200 bg-white p-6 shadow-sm">
        {renderActiveModule()}
      </section>
    </div>
  );
};

export default TournamentDetails;
