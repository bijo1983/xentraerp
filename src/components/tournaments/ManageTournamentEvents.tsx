import React, { useEffect, useMemo, useState } from "react";
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

type EventPreset = {
  event_type: string;
  gender: "male" | "female" | "mixed";
  ageGroups?: string[];
  skillLevels?: string[];
  registration_fee?: number;
  max_entries?: number;
};

type CategoryPreset = {
  id: string;
  label: string;
  description: string;
  events: EventPreset[];
};

const CATEGORY_PRESETS: CategoryPreset[] = [
  {
    id: "junior-singles-doubles",
    label: "Junior Singles & Doubles",
    description: "Boys & Girls – Singles & Doubles (U9, U11, U13, U15, U17, U19)",
    events: [
      {
        event_type: "Boys Singles",
        gender: "male",
        ageGroups: ["U9", "U11", "U13", "U15", "U17", "U19"],
      },
      {
        event_type: "Boys Doubles",
        gender: "male",
        ageGroups: ["U9", "U11", "U13", "U15", "U17", "U19"],
      },
      {
        event_type: "Girls Singles",
        gender: "female",
        ageGroups: ["U9", "U11", "U13", "U15", "U17", "U19"],
      },
      {
        event_type: "Girls Doubles",
        gender: "female",
        ageGroups: ["U9", "U11", "U13", "U15", "U17", "U19"],
      },
    ],
  },
  {
    id: "mens-doubles-levels",
    label: "Men's Doubles Levels",
    description: "Men’s Doubles – Elite, Championship, F1, F2, F3, F4, F5",
    events: [
      {
        event_type: "Men's Doubles",
        gender: "male",
        skillLevels: ["Elite", "Championship", "F1", "F2", "F3", "F4", "F5"],
      },
    ],
  },
  {
    id: "womens-doubles-levels",
    label: "Women's Doubles Levels",
    description: "Women’s Doubles – Level 1, Level 2, Beginners",
    events: [
      {
        event_type: "Women's Doubles",
        gender: "female",
        skillLevels: ["Level 1", "Level 2", "Beginners"],
      },
    ],
  },
  {
    id: "mixed-doubles-levels",
    label: "Mixed Doubles Levels",
    description:
      "Mixed Doubles – Elite, Championship, L1(F1+F2), L2(F3+F4), L3(F5+Beginners), L-Master’s (Age Male 45+ & Female 40+)",
    events: [
      {
        event_type: "Mixed Doubles",
        gender: "mixed",
        skillLevels: [
          "Elite",
          "Championship",
          "L1 (F1 + F2)",
          "L2 (F3 + F4)",
          "L3 (F5 + Beginners)",
          "L-Master’s",
        ],
        ageGroups: ["Male 45+ & Female 40+"],
      },
    ],
  },
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
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusType, setStatusType] = useState<"success" | "error" | null>(null);

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
    setStatusMessage(null);
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

  const existingEventsKey = useMemo(() => {
    const map = new Set<string>();
    events.forEach(ev => {
      const key = [
        ev.event_type,
        ev.gender || "",
        ev.age_group || "",
        ev.skill_level || "",
      ].join("|#|");
      map.add(key);
    });
    return map;
  }, [events]);

  const ensureDropdownOptions = async (preset: CategoryPreset) => {
    const eventTypeValues = Array.from(
      new Set(preset.events.map(ev => ev.event_type)),
    );
    const ageGroupValues = new Set<string>();
    const skillLevelValues = new Set<string>();
    preset.events.forEach(ev => {
      ev.ageGroups?.forEach(age => ageGroupValues.add(age));
      ev.skillLevels?.forEach(skill => skillLevelValues.add(skill));
    });

    const operations: Promise<any>[] = [];
    if (eventTypeValues.length) {
      operations.push(
        supabase
          .from("event_types")
          .upsert(
            eventTypeValues.map(name => ({ name })),
            { onConflict: "name" },
          ),
      );
    }
    if (ageGroupValues.size) {
      operations.push(
        supabase
          .from("age_groups")
          .upsert(
            Array.from(ageGroupValues).map(name => ({ name })),
            { onConflict: "name" },
          ),
      );
    }
    if (skillLevelValues.size) {
      operations.push(
        supabase
          .from("skill_levels")
          .upsert(
            Array.from(skillLevelValues).map(name => ({ name })),
            { onConflict: "name" },
          ),
      );
    }

    if (operations.length) {
      await Promise.all(operations);
      await fetchDropdownOptions();
    }
  };

  const handleAddPreset = async (preset: CategoryPreset) => {
    setLoading(true);
    setStatusMessage(null);
    setStatusType(null);
    try {
      await ensureDropdownOptions(preset);

      const recordsToInsert: any[] = [];
      preset.events.forEach(evPreset => {
        const ageGroups = evPreset.ageGroups?.length
          ? evPreset.ageGroups
          : [null];
        const skillLevels = evPreset.skillLevels?.length
          ? evPreset.skillLevels
          : [null];

        ageGroups.forEach(age => {
          skillLevels.forEach(skill => {
            const key = [
              evPreset.event_type,
              evPreset.gender,
              age || "",
              skill || "",
            ].join("|#|");
            if (existingEventsKey.has(key)) return;

            const baseRecord: any = {
              tournament_id: tournament.id,
              event_type: evPreset.event_type,
              gender: evPreset.gender,
              registration_fee: evPreset.registration_fee ?? 0,
              max_entries: evPreset.max_entries ?? 32,
            };

            if (age) {
              baseRecord.age_group = age;
            }
            if (skill) {
              baseRecord.skill_level = skill;
            }
            recordsToInsert.push(baseRecord);
          });
        });
      });

      if (recordsToInsert.length === 0) {
        setStatusType("error");
        setStatusMessage("All of the events from this preset are already added.");
      } else {
        const { error } = await supabase
          .from("tournament_events")
          .insert(recordsToInsert);
        if (error) {
          throw error;
        }
        setStatusType("success");
        setStatusMessage(
          `Added ${recordsToInsert.length} event${
            recordsToInsert.length > 1 ? "s" : ""
          } from the preset.`,
        );
      }
      await fetchEvents();
    } catch (error: any) {
      setStatusType("error");
      setStatusMessage(error.message || "Failed to add preset events.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">
        Manage Events for {tournament.name}
      </h2>

      {statusMessage && (
        <div
          className={`mb-4 rounded border px-3 py-2 text-sm ${
            statusType === "success"
              ? "border-green-200 bg-green-50 text-green-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {statusMessage}
        </div>
      )}

      <div className="mb-6 rounded border border-dashed border-gray-300 bg-gray-50 p-4">
        <h3 className="text-lg font-semibold mb-2">Quick Add Categories</h3>
        <p className="text-sm text-gray-600 mb-3">
          Instantly create all the required events for common tournament categories.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          {CATEGORY_PRESETS.map(preset => (
            <button
              key={preset.id}
              type="button"
              onClick={() => handleAddPreset(preset)}
              disabled={loading}
              className="rounded border border-blue-200 bg-white px-3 py-2 text-left shadow-sm transition hover:border-blue-400 hover:shadow"
            >
              <div className="font-medium text-blue-700">{preset.label}</div>
              <div className="text-xs text-gray-600">{preset.description}</div>
            </button>
          ))}
        </div>
      </div>

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
