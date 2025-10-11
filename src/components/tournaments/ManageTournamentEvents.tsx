import React, { useEffect, useState } from "react";
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
  max_entries?: number;
};

const genderOptions = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "mixed", label: "Mixed" },
];

interface DropdownOption { value: string; label: string; }

interface Props {
  tournament: Tournament;
}

const ManageTournamentEvents: React.FC<Props> = ({ tournament }) => {
  const { userProfile } = useAuthStore();
  const [events, setEvents] = useState<TournamentEvent[]>([]);
  const [eventTypeOptions, setEventTypeOptions] = useState<DropdownOption[]>([]);
  const [ageGroupOptions, setAgeGroupOptions] = useState<DropdownOption[]>([]);
  const [skillLevelOptions, setSkillLevelOptions] = useState<DropdownOption[]>([]);
  const [form, setForm] = useState({
    event_type: "",
    age_group: "",
    gender: "male",
    skill_level: "",
    registration_fee: "",
    max_entries: 32,
  });
  const [loading, setLoading] = useState(false);

  // Fetch dropdowns and events on mount
  useEffect(() => {
    fetchDropdownOptions();
    fetchEvents();
  }, [tournament.id]);

  const fetchDropdownOptions = async () => {
    // Event types
    let { data: types } = await supabase.from("event_types").select("name");
    setEventTypeOptions((types || []).map((t: any) => ({ value: t.name, label: t.name })));
    // Age groups
    let { data: ages } = await supabase.from("age_groups").select("name");
    setAgeGroupOptions((ages || []).map((a: any) => ({ value: a.name, label: a.name })));
    // Skill levels
    let { data: skills } = await supabase.from("skill_levels").select("name");
    setSkillLevelOptions((skills || []).map((s: any) => ({ value: s.name, label: s.name })));
    // Set defaults if empty
    setForm(f => ({
      ...f,
      event_type: types?.[0]?.name || "",
      age_group: ages?.[0]?.name || "",
      skill_level: skills?.[0]?.name || "",
    }));
  };

  const fetchEvents = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("tournament_events")
      .select("*")
      .eq("tournament_id", tournament.id)
      .order("event_type");
    setEvents(data || []);
    setLoading(false);
  };

  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await supabase.from("tournament_events").insert([
      {
        tournament_id: tournament.id,
        event_type: form.event_type,
        age_group: form.age_group,
        gender: form.gender,
        skill_level: form.skill_level,
        registration_fee: parseFloat(form.registration_fee) || 0,
        max_entries: Number(form.max_entries) || 32,
      },
    ]);
    // Reset only fee/max entries; keep dropdowns as last used
    setForm(f => ({
      ...f,
      registration_fee: "",
      max_entries: 32,
    }));
    fetchEvents();
    setLoading(false);
  };

  const handleDeleteEvent = async (eventId: string) => {
    setLoading(true);
    await supabase.from("tournament_events").delete().eq("id", eventId);
    fetchEvents();
    setLoading(false);
  };

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">
        Manage Events for {tournament.name}
      </h2>

      {/* Add new event form */}
      <form onSubmit={handleAddEvent} className="mb-6 grid gap-4 md:grid-cols-2">
        <label>
          Event Type
          <select
            value={form.event_type}
            onChange={e => setForm({ ...form, event_type: e.target.value })}
            className="block w-full border rounded p-2 mt-1"
            required
          >
            <option value="">Select...</option>
            {eventTypeOptions.map(opt => (
              <option value={opt.value} key={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>
        <label>
          Age Group
          <select
            value={form.age_group}
            onChange={e => setForm({ ...form, age_group: e.target.value })}
            className="block w-full border rounded p-2 mt-1"
            required
          >
            <option value="">Select...</option>
            {ageGroupOptions.map(opt => (
              <option value={opt.value} key={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>
        <label>
          Gender
          <select
            value={form.gender}
            onChange={e => setForm({ ...form, gender: e.target.value })}
            className="block w-full border rounded p-2 mt-1"
          >
            {genderOptions.map(opt => (
              <option value={opt.value} key={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>
        <label>
          Skill Level
          <select
            value={form.skill_level}
            onChange={e => setForm({ ...form, skill_level: e.target.value })}
            className="block w-full border rounded p-2 mt-1"
            required
          >
            <option value="">Select...</option>
            {skillLevelOptions.map(opt => (
              <option value={opt.value} key={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>
        <label>
          Registration Fee ({tournament.currency_code})
          <input
            type="number"
            min={0}
            value={form.registration_fee}
            onChange={e => setForm({ ...form, registration_fee: e.target.value })}
            className="block w-full border rounded p-2 mt-1"
            step="any"
          />
        </label>
        <label>
          Max Entries
          <input
            type="number"
            min={2}
            value={form.max_entries}
            onChange={e => setForm({ ...form, max_entries: Number(e.target.value) })}
            className="block w-full border rounded p-2 mt-1"
          />
        </label>
        <button
          type="submit"
          disabled={loading}
          className="col-span-2 mt-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded"
        >
          {loading ? "Adding..." : "Add Event"}
        </button>
      </form>

      {/* Events list */}
      <h3 className="text-lg font-bold mb-2">Current Events</h3>
      {loading ? (
        <div>Loading...</div>
      ) : events.length === 0 ? (
        <div className="text-gray-500">No events yet.</div>
      ) : (
        <ul className="space-y-2">
          {events.map(ev => (
            <li key={ev.id} className="p-3 bg-gray-50 rounded border flex items-center justify-between">
              <span>
                <b>{ev.event_type}</b>
                {ev.age_group && ` – ${ev.age_group}`}
                {ev.gender && ` – ${ev.gender}`}
                {ev.skill_level && ` – ${ev.skill_level}`}
                {` (Fee: ${tournament.currency_code} ${ev.registration_fee})`}
              </span>
              <button
                className="ml-2 bg-red-500 text-white px-3 py-1 rounded"
                onClick={() => handleDeleteEvent(ev.id)}
                disabled={loading}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Suggest link to manage dropdown options */}
      <div className="mt-6">
        <span className="text-sm text-gray-500">
          Need to add more event types, age groups, or skill levels?&nbsp;
          <a
            href="/admin/manage-dropdown-options"
            className="text-blue-600 underline"
          >Manage Dropdown Options</a>
        </span>
      </div>
    </div>
  );
};

export default ManageTournamentEvents;
