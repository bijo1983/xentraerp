import React, { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAuthStore } from "../../store/authStore";
import TournamentCategoriesPanel from "./modules/TournamentCategoriesPanel";
import TournamentFixturesPanel from "./modules/TournamentFixturesPanel";
import TournamentRegistrationsPanel from "./modules/TournamentRegistrationsPanel";
import TournamentScoreInputPanel from "./modules/TournamentScoreInputPanel";
import TournamentResultsReviewPanel from "./modules/TournamentResultsReviewPanel";

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
  prize_pool?: number | null;
  tournament_format?: string;
  status?: string;
  currency_code?: string;
  organizer_id: string;
  organizer_type?: string;
}

type ModuleKey =
  | "overview"
  | "categories"
  | "fixtures"
  | "registrations"
  | "scores"
  | "results";

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
  const [activeModule, setActiveModule] = useState<ModuleKey>("overview");

  useEffect(() => {
    const fetchTournament = async () => {
      if (!userProfile?.id || !id) {
        setError("Authentication and profile required");
        setLoading(false);
        return;
      }

      setLoading(true);
      const { data: tournamentData, error: tournamentError } = await supabase
        .from("tournaments")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (tournamentError || !tournamentData) {
        setError("Failed to load tournament");
        setLoading(false);
        return;
      }

      setForm(tournamentData);
      setIsOwner(user?.id === tournamentData.organizer_id);
      setLoading(false);
    };

    fetchTournament();
  }, [id, userProfile?.id, user?.id]);

  const handleChange = (e: React.ChangeEvent<any>) => {
    if (!form) return;
    const { name, value } = e.target;
    const parsed = ["max_participants", "entry_fee", "prize_pool"].includes(name)
      ? value === "" ? null : Number(value)
      : value;
    setForm({ ...form, [name]: parsed });
    setError(null);
    setSuccess(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form || !id || !userProfile?.type || !user?.id) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    const updatePayload = {
      ...form,
      organizer_type: userProfile.type,
    };

    const { data, error } = await supabase
      .from("tournaments")
      .update(updatePayload)
      .eq("id", id)
      .eq("organizer_id", user.id)
      .select();

    if (error) {
      setError("Failed to update tournament: " + error.message);
    } else if (!data || data.length === 0) {
      setError("No data returned or permission denied");
    } else {
      setSuccess("Tournament updated successfully!");
      setForm(data[0]);
      setTimeout(() => setSuccess(null), 3000);
    }
    setSaving(false);
  };

  const moduleButtons = useMemo(
    () => [
      {
        id: "overview" as ModuleKey,
        label: "Overview",
        description: "Update tournament basics and status",
      },
      {
        id: "categories" as ModuleKey,
        label: "Categories",
        description: "Assign singles, doubles, and age ladders",
      },
      {
        id: "fixtures" as ModuleKey,
        label: "Fixtures",
        description: "Review generated brackets and matchups",
      },
      {
        id: "registrations" as ModuleKey,
        label: "Registrations",
        description: "Monitor player sign-ups by category",
      },
      {
        id: "scores" as ModuleKey,
        label: "Score Input",
        description: "Capture results as matches conclude",
      },
      {
        id: "results" as ModuleKey,
        label: "Results Review",
        description: "Confirm winners for each category",
      },
    ],
    [],
  );

  if (loading) return <div className="p-8">Loading tournament...</div>;
  if (error && !form)
    return <div className="p-8 text-red-600">{error}</div>;
  if (!form) return <div className="p-8">Tournament not found</div>;

  const tournament = form;

  const renderOverviewModule = () => (
    <form onSubmit={handleSave} className="space-y-4">
      <input
        name="name"
        value={tournament.name || ""}
        onChange={handleChange}
        disabled={!isOwner}
        className="w-full rounded border p-2"
        placeholder="Tournament Name"
      />
      <textarea
        name="description"
        value={tournament.description || ""}
        onChange={handleChange}
        disabled={!isOwner}
        className="w-full rounded border p-2"
        placeholder="Description"
      />
      <input
        name="location"
        value={tournament.location || ""}
        onChange={handleChange}
        disabled={!isOwner}
        className="w-full rounded border p-2"
        placeholder="Location"
      />
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block text-sm">
          <span className="text-gray-600">Start Date</span>
          <input
            name="start_date"
            type="date"
            value={tournament.start_date || ""}
            onChange={handleChange}
            disabled={!isOwner}
            className="mt-1 w-full rounded border p-2"
          />
        </label>
        <label className="block text-sm">
          <span className="text-gray-600">End Date</span>
          <input
            name="end_date"
            type="date"
            value={tournament.end_date || ""}
            onChange={handleChange}
            disabled={!isOwner}
            className="mt-1 w-full rounded border p-2"
          />
        </label>
        <label className="block text-sm">
          <span className="text-gray-600">Registration Deadline</span>
          <input
            name="registration_deadline"
            type="date"
            value={tournament.registration_deadline || ""}
            onChange={handleChange}
            disabled={!isOwner}
            className="mt-1 w-full rounded border p-2"
          />
        </label>
        <label className="block text-sm">
          <span className="text-gray-600">Max Participants</span>
          <input
            name="max_participants"
            type="number"
            value={tournament.max_participants || ""}
            onChange={handleChange}
            disabled={!isOwner}
            className="mt-1 w-full rounded border p-2"
            placeholder="Max Participants"
          />
        </label>
        <label className="block text-sm">
          <span className="text-gray-600">Entry Fee</span>
          <input
            name="entry_fee"
            type="number"
            step="0.01"
            value={tournament.entry_fee || ""}
            onChange={handleChange}
            disabled={!isOwner}
            className="mt-1 w-full rounded border p-2"
            placeholder="Entry Fee"
          />
        </label>
        <label className="block text-sm">
          <span className="text-gray-600">Prize Pool</span>
          <input
            name="prize_pool"
            type="number"
            step="0.01"
            value={tournament.prize_pool || ""}
            onChange={handleChange}
            disabled={!isOwner}
            className="mt-1 w-full rounded border p-2"
            placeholder="Prize Pool"
          />
        </label>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block text-sm">
          <span className="text-gray-600">Format</span>
          <select
            name="tournament_format"
            value={tournament.tournament_format ?? ""}
            onChange={handleChange}
            disabled={!isOwner}
            className="mt-1 w-full rounded border p-2"
          >
            <option value="single_elimination">Single Elimination</option>
            <option value="double_elimination">Double Elimination</option>
            <option value="round_robin">Round Robin</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-gray-600">Status</span>
          <select
            name="status"
            value={tournament.status ?? ""}
            onChange={handleChange}
            disabled={!isOwner}
            className="mt-1 w-full rounded border p-2"
          >
            <option value="upcoming">Upcoming</option>
            <option value="registration_open">Registration Open</option>
            <option value="ongoing">Ongoing</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
      </div>
      {isOwner && (
        <button
          type="submit"
          disabled={saving}
          className="rounded bg-primary-500 px-4 py-2 font-semibold text-white transition-colors hover:bg-primary-600"
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

  const renderActiveModule = () => {
    switch (activeModule) {
      case "categories":
        return (
          <TournamentCategoriesPanel
            tournament={{
              id: tournament.id,
              name: tournament.name,
              currency_code: tournament.currency_code,
            }}
          />
        );
      case "fixtures":
        return <TournamentFixturesPanel tournamentId={tournament.id} />;
      case "registrations":
        return <TournamentRegistrationsPanel tournamentId={tournament.id} />;
      case "scores":
        return <TournamentScoreInputPanel tournamentId={tournament.id} />;
      case "results":
        return <TournamentResultsReviewPanel tournamentId={tournament.id} />;
      case "overview":
      default:
        return renderOverviewModule();
    }
  };

  return (
    <div className="space-y-6 p-8">
      <div className="rounded border border-blue-200 bg-blue-50 p-4">
        <h1 className="text-2xl font-bold text-blue-900">Tournament Control Center</h1>
        <p className="mt-1 text-sm text-blue-700">
          Once your tournament is created, manage categories, fixtures, player
          registrations, live scoring, and results from a single action menu.
        </p>
      </div>

      {success && (
        <div className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          {success}
        </div>
      )}
      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <nav className="rounded border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold text-gray-800">Action Menu</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {moduleButtons.map(button => (
            <button
              key={button.id}
              type="button"
              onClick={() => setActiveModule(button.id)}
              className={`rounded border p-3 text-left transition focus:outline-none focus:ring-2 focus:ring-primary-400 ${
                activeModule === button.id
                  ? "border-primary-500 bg-primary-50 text-primary-700"
                  : "border-gray-200 hover:border-primary-300"
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
