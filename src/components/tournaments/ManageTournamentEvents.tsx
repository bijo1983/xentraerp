import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

export type TournamentSummary = {
  id: string;
  name: string;
  currency_code?: string | null;
  default_registration_fee?: number | string | null;
  entry_fee?: number | string | null;
};

type TournamentEvent = {
  id: string;
  event_type: string;
  age_group?: string;
  gender?: string;
  skill_level?: string;
  registration_fee?: number | null;
  max_entries?: number | null;
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
    description:
      "Boys & Girls – Singles & Doubles (U9, U11, U13, U15, U17, U19)",
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

interface DropdownOption {
  value: string;
  label: string;
}

interface Props {
  tournament: TournamentSummary;
}

type StatusType = "success" | "error" | "info" | null;

type FormState = {
  event_type: string;
  age_group: string;
  gender: "male" | "female" | "mixed";
  skill_level: string;
  registration_fee: string;
  max_entries: number;
};

const capitalize = (value?: string | null) => {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
};

const buildEventLabel = (event: {
  event_type: string;
  age_group?: string | null;
  skill_level?: string | null;
  gender?: string | null;
}) => {
  const parts = [event.event_type];
  if (event.age_group) parts.push(event.age_group);
  if (event.skill_level) parts.push(event.skill_level);
  if (event.gender) parts.push(capitalize(event.gender));
  return parts.filter(Boolean).join(" · ");
};

const normalizeFee = (value?: number | string | null) => {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const ManageTournamentEvents: React.FC<Props> = ({ tournament }) => {
  const currencyCode = tournament.currency_code || "USD";
  const defaultRegistrationFee =
    normalizeFee(tournament.default_registration_fee) ?? normalizeFee(tournament.entry_fee);

  const createInitialFormState = (): FormState => ({
    event_type: "",
    age_group: "",
    gender: "male",
    skill_level: "",
    registration_fee:
      defaultRegistrationFee !== null && defaultRegistrationFee !== undefined
        ? String(defaultRegistrationFee)
        : "",
    max_entries: 32,
  });

  const fallbackCatalog = useMemo(() => {
    const eventTypes = new Set<string>();
    const ageGroups = new Set<string>();
    const skillLevels = new Set<string>();
    CATEGORY_PRESETS.forEach(preset => {
      preset.events.forEach(event => {
        eventTypes.add(event.event_type);
        event.ageGroups?.forEach(age => ageGroups.add(age));
        event.skillLevels?.forEach(level => skillLevels.add(level));
      });
    });
    return {
      eventTypes: Array.from(eventTypes),
      ageGroups: Array.from(ageGroups),
      skillLevels: Array.from(skillLevels),
    };
  }, []);

  const [events, setEvents] = useState<TournamentEvent[]>([]);
  const [eventTypeOptions, setEventTypeOptions] = useState<DropdownOption[]>([]);
  const [ageGroupOptions, setAgeGroupOptions] = useState<DropdownOption[]>([]);
  const [skillLevelOptions, setSkillLevelOptions] = useState<DropdownOption[]>([]);
  const [form, setForm] = useState<FormState>(createInitialFormState);
  const [isMutating, setIsMutating] = useState(false);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [dropdownLoading, setDropdownLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusType, setStatusType] = useState<StatusType>(null);
  const [showPresetWizard, setShowPresetWizard] = useState(false);
  const [dismissedPresetPrompt, setDismissedPresetPrompt] = useState(false);
  const [selectedPresetIds, setSelectedPresetIds] = useState<string[]>([]);
  const [presetSearch, setPresetSearch] = useState("");
  const [editingEvent, setEditingEvent] = useState<TournamentEvent | null>(null);

  useEffect(() => {
    fetchDropdownOptions();
    fetchEvents();
  }, [tournament.id]);

  useEffect(() => {
    if (!eventsLoading && events.length === 0 && !dismissedPresetPrompt) {
      setShowPresetWizard(true);
    }
  }, [eventsLoading, events.length, dismissedPresetPrompt]);

  const fetchDropdownOptions = async () => {
    setDropdownLoading(true);
    try {
      const [typesRes, agesRes, skillsRes] = await Promise.all([
        supabase.from("event_types").select("name"),
        supabase.from("age_groups").select("name"),
        supabase.from("skill_levels").select("name"),
      ]);

      const eventTypeValues = new Set<string>(fallbackCatalog.eventTypes);
      typesRes.data?.forEach((row: any) => {
        if (row?.name) eventTypeValues.add(row.name);
      });

      const ageGroupValues = new Set<string>(fallbackCatalog.ageGroups);
      agesRes.data?.forEach((row: any) => {
        if (row?.name) ageGroupValues.add(row.name);
      });

      const skillLevelValues = new Set<string>(fallbackCatalog.skillLevels);
      skillsRes.data?.forEach((row: any) => {
        if (row?.name) skillLevelValues.add(row.name);
      });

      const eventOptions = Array.from(eventTypeValues).sort();
      const ageOptions = Array.from(ageGroupValues).sort();
      const skillOptions = Array.from(skillLevelValues).sort();

      setEventTypeOptions(eventOptions.map(value => ({ value, label: value })));
      setAgeGroupOptions(ageOptions.map(value => ({ value, label: value })));
      setSkillLevelOptions(skillOptions.map(value => ({ value, label: value })));

      setForm(current => ({
        ...current,
        event_type: current.event_type || eventOptions[0] || "",
        age_group: current.age_group || ageOptions[0] || "",
        skill_level: current.skill_level || skillOptions[0] || "",
      }));

      if (!eventOptions.length) {
        setStatusType("info");
        setStatusMessage(
          "No saved dropdown options were found. Built-in category presets are being used instead.",
        );
      }
    } catch (error: any) {
      setStatusType("info");
      setStatusMessage(
        error?.message
          ? `Unable to load saved dropdown options: ${error.message}. Using built-in presets instead.`
          : "Unable to load saved dropdown options. Using built-in presets instead.",
      );

      setEventTypeOptions(
        fallbackCatalog.eventTypes
          .sort()
          .map(value => ({ value, label: value })),
      );
      setAgeGroupOptions(
        fallbackCatalog.ageGroups
          .sort()
          .map(value => ({ value, label: value })),
      );
      setSkillLevelOptions(
        fallbackCatalog.skillLevels
          .sort()
          .map(value => ({ value, label: value })),
      );
    } finally {
      setDropdownLoading(false);
    }
  };

  const fetchEvents = async () => {
    setEventsLoading(true);
    try {
      const { data, error } = await supabase
        .from("tournament_events")
        .select("*")
        .eq("tournament_id", tournament.id)
        .order("event_type");

      if (error) throw error;

      setEvents(data || []);
    } catch (error: any) {
      setEvents([]);
      setStatusType("error");
      setStatusMessage(
        error?.message ||
          "Unable to load existing events. Confirm that the tournament_events table is available.",
      );
    } finally {
      setEventsLoading(false);
    }
  };

  const existingEventsKey = useMemo(() => {
    const map = new Set<string>();
    events.forEach(event => {
      const key = [
        event.event_type,
        event.gender || "",
        event.age_group || "",
        event.skill_level || "",
      ].join("|#|");
      map.add(key);
    });
    return map;
  }, [events]);

  const ensureDropdownOptionsForPresets = async (presets: CategoryPreset[]) => {
    const eventTypeValues = new Set<string>();
    const ageGroupValues = new Set<string>();
    const skillLevelValues = new Set<string>();

    presets.forEach(preset => {
      preset.events.forEach(event => {
        eventTypeValues.add(event.event_type);
        event.ageGroups?.forEach(age => ageGroupValues.add(age));
        event.skillLevels?.forEach(skill => skillLevelValues.add(skill));
      });
    });

    const operations: Promise<any>[] = [];

    if (eventTypeValues.size) {
      operations.push(
        supabase
          .from("event_types")
          .upsert(Array.from(eventTypeValues).map(name => ({ name })), {
            onConflict: "name",
          }),
      );
    }

    if (ageGroupValues.size) {
      operations.push(
        supabase
          .from("age_groups")
          .upsert(Array.from(ageGroupValues).map(name => ({ name })), {
            onConflict: "name",
          }),
      );
    }

    if (skillLevelValues.size) {
      operations.push(
        supabase
          .from("skill_levels")
          .upsert(Array.from(skillLevelValues).map(name => ({ name })), {
            onConflict: "name",
          }),
      );
    }

    if (operations.length) {
      await Promise.all(operations);
      await fetchDropdownOptions();
    }
  };

  const buildRecordsForPresets = (
    presets: CategoryPreset[],
    keySet: Set<string>,
    fallbackFee: number | null,
  ) => {
    const records: any[] = [];

    presets.forEach(preset => {
      preset.events.forEach(event => {
        const ageGroups = event.ageGroups?.length ? event.ageGroups : [null];
        const skillLevels = event.skillLevels?.length ? event.skillLevels : [null];

        ageGroups.forEach(age => {
          skillLevels.forEach(skill => {
            const key = [
              event.event_type,
              event.gender,
              age || "",
              skill || "",
            ].join("|#|");

            if (keySet.has(key)) return;
            keySet.add(key);

            const record: any = {
              tournament_id: tournament.id,
              event_type: event.event_type,
              gender: event.gender,
              registration_fee: event.registration_fee ?? fallbackFee ?? 0,
              max_entries: event.max_entries ?? 32,
            };

            if (age) record.age_group = age;
            if (skill) record.skill_level = skill;

            records.push(record);
          });
        });
      });
    });

    return records;
  };
  const resolveFormRegistrationFee = () => {
    if (!form.registration_fee || !form.registration_fee.trim()) {
      return defaultRegistrationFee ?? 0;
    }
    const parsed = parseFloat(form.registration_fee);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
    return defaultRegistrationFee ?? 0;
  };

  const resetFormState = () => {
    setForm(createInitialFormState());
  };

  useEffect(() => {
    setSelectedPresetIds([]);
    setPresetSearch("");
    setStatusMessage(null);
    setStatusType(null);
    setEditingEvent(null);
    resetFormState();
  }, [tournament.id, defaultRegistrationFee]);

  const handleSubmitEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.event_type) {
      setStatusType("error");
      setStatusMessage("Please select an event type before adding.");
      return;
    }

    setIsMutating(true);
    setStatusMessage(null);
    setStatusType(null);

    const registrationFee = resolveFormRegistrationFee();
    const payload = {
      tournament_id: tournament.id,
      event_type: form.event_type,
      age_group: form.age_group || null,
      gender: form.gender,
      skill_level: form.skill_level || null,
      registration_fee: registrationFee,
      max_entries: Number(form.max_entries) || 32,
    };

    try {
      if (editingEvent) {
        const { error } = await supabase
          .from("tournament_events")
          .update({
            event_type: payload.event_type,
            age_group: payload.age_group,
            gender: payload.gender,
            skill_level: payload.skill_level,
            registration_fee: payload.registration_fee,
            max_entries: payload.max_entries,
          })
          .eq("id", editingEvent.id);

        if (error) throw error;

        setStatusType("success");
        setStatusMessage("Event updated successfully.");
        setEditingEvent(null);
      } else {
        const { error } = await supabase.from("tournament_events").insert([payload]);

        if (error) throw error;

        setStatusType("success");
        setStatusMessage("Event added successfully.");
      }

      resetFormState();
      await fetchEvents();
    } catch (error: any) {
      setStatusType("error");
      setStatusMessage(error?.message || "Failed to save event.");
    } finally {
      setIsMutating(false);
    }
  };

  const handleEditEvent = (event: TournamentEvent) => {
    setEditingEvent(event);
    setStatusMessage(null);
    setStatusType(null);
    setForm({
      event_type: event.event_type,
      age_group: event.age_group || "",
      gender: (event.gender as FormState["gender"]) || "male",
      skill_level: event.skill_level || "",
      registration_fee:
        event.registration_fee !== null && event.registration_fee !== undefined
          ? String(event.registration_fee)
          : defaultRegistrationFee !== null && defaultRegistrationFee !== undefined
            ? String(defaultRegistrationFee)
            : "",
      max_entries: event.max_entries ?? 32,
    });
  };

  const handleCancelEdit = () => {
    setEditingEvent(null);
    resetFormState();
  };

  const handleDeleteEvent = async (eventId: string) => {
    setIsMutating(true);
    setStatusMessage(null);
    setStatusType(null);
    try {
      const { error } = await supabase
        .from("tournament_events")
        .delete()
        .eq("id", eventId);

      if (error) throw error;

      setStatusType("success");
      setStatusMessage("Event removed.");
      if (editingEvent?.id === eventId) {
        handleCancelEdit();
      }
      await fetchEvents();
    } catch (error: any) {
      setStatusType("error");
      setStatusMessage(error?.message || "Unable to delete this event.");
    } finally {
      setIsMutating(false);
    }
  };

  const handleAddPreset = async (preset: CategoryPreset) => {
    setIsMutating(true);
    setStatusMessage(null);
    setStatusType(null);
    try {
      await ensureDropdownOptionsForPresets([preset]);
      const records = buildRecordsForPresets(
        [preset],
        new Set(existingEventsKey),
        defaultRegistrationFee ?? 0,
      );

      if (!records.length) {
        setStatusType("error");
        setStatusMessage("All of the events from this preset are already added.");
      } else {
        const { error } = await supabase
          .from("tournament_events")
          .insert(records);
        if (error) throw error;
        setStatusType("success");
        setStatusMessage(
          "Added " +
            records.length +
            " event" +
            (records.length > 1 ? "s" : "") +
            " from the preset.",
        );
        await fetchEvents();
      }
    } catch (error: any) {
      setStatusType("error");
      setStatusMessage(error?.message || "Failed to add preset events.");
    } finally {
      setIsMutating(false);
    }
  };

  const handleBulkAddPresets = async () => {
    if (!selectedPresetIds.length) {
      setStatusType("error");
      setStatusMessage("Select at least one category to add.");
      return;
    }

    const presets = CATEGORY_PRESETS.filter(preset =>
      selectedPresetIds.includes(preset.id),
    );

    setIsMutating(true);
    setStatusMessage(null);
    setStatusType(null);

    try {
      await ensureDropdownOptionsForPresets(presets);
      const records = buildRecordsForPresets(
        presets,
        new Set(existingEventsKey),
        defaultRegistrationFee ?? 0,
      );

      if (!records.length) {
        setStatusType("error");
        setStatusMessage("All selected categories already exist for this tournament.");
      } else {
        const { error } = await supabase
          .from("tournament_events")
          .insert(records);
        if (error) throw error;
        setStatusType("success");
        setStatusMessage(
          "Added " +
            records.length +
            " event" +
            (records.length > 1 ? "s" : "") +
            " across " +
            presets.length +
            " categor" +
            (presets.length === 1 ? "y" : "ies") +
            ".",
        );
        await fetchEvents();
        setSelectedPresetIds([]);
        setShowPresetWizard(false);
        setDismissedPresetPrompt(true);
      }
    } catch (error: any) {
      setStatusType("error");
      setStatusMessage(error?.message || "Failed to add the selected categories.");
    } finally {
      setIsMutating(false);
    }
  };

  const filteredPresets = useMemo(() => {
    const needle = presetSearch.trim().toLowerCase();
    if (!needle) return CATEGORY_PRESETS;
    return CATEGORY_PRESETS.filter(preset => {
      const haystack = `${preset.label} ${preset.description}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [presetSearch]);

  const togglePresetSelection = (presetId: string) => {
    setSelectedPresetIds(current =>
      current.includes(presetId)
        ? current.filter(id => id !== presetId)
        : [...current, presetId],
    );
  };

  const closePresetWizard = () => {
    setShowPresetWizard(false);
    setDismissedPresetPrompt(true);
    setSelectedPresetIds([]);
  };

  const disableForm = dropdownLoading || isMutating;

  const statusClasses =
    statusType === "success"
      ? "border-green-200 bg-green-50 text-green-700"
      : statusType === "error"
        ? "border-red-200 bg-red-50 text-red-700"
        : "border-blue-200 bg-blue-50 text-blue-700";
  return (
    <div className="relative space-y-6 p-4">
      {showPresetWizard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold text-gray-800">
                  Select Categories for {tournament.name}
                </h3>
                <p className="mt-1 text-sm text-gray-600">
                  Choose one or more presets to instantly populate all relevant events.
                  You can fine-tune registration limits and fees afterwards.
                </p>
              </div>
              <button
                type="button"
                onClick={closePresetWizard}
                className="rounded border border-gray-200 px-3 py-1 text-sm text-gray-600 hover:bg-gray-50"
              >
                Close
              </button>
            </div>

            <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <label className="flex w-full items-center gap-2 md:w-80">
                <span className="text-sm font-medium text-gray-600">Search presets</span>
                <input
                  type="search"
                  value={presetSearch}
                  onChange={event => setPresetSearch(event.target.value)}
                  placeholder="e.g. Doubles, Junior"
                  className="flex-1 rounded border px-2 py-1"
                />
              </label>
              <div className="text-sm text-gray-500">
                Selected presets: <b>{selectedPresetIds.length}</b>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {filteredPresets.length === 0 ? (
                <div className="col-span-full rounded border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600">
                  No presets match your search. Try another keyword.
                </div>
              ) : (
                filteredPresets.map(preset => (
                  <label
                    key={preset.id}
                    className={`flex cursor-pointer items-start gap-3 rounded border p-3 shadow-sm transition hover:border-blue-300 ${
                      selectedPresetIds.includes(preset.id)
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-200 bg-white"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedPresetIds.includes(preset.id)}
                      onChange={() => togglePresetSelection(preset.id)}
                      className="mt-1"
                    />
                    <div>
                      <div className="font-medium text-blue-700">{preset.label}</div>
                      <div className="text-xs text-gray-600">{preset.description}</div>
                    </div>
                  </label>
                ))
              )}
            </div>

            <div className="mt-6 flex flex-col gap-3 border-t pt-4 md:flex-row md:items-center md:justify-between">
              <div className="text-sm text-gray-600">
                Tip: you can reopen this selector any time from the categories panel.
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={closePresetWizard}
                  className="rounded border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
                  disabled={isMutating}
                >
                  Skip for now
                </button>
                <button
                  type="button"
                  onClick={handleBulkAddPresets}
                  disabled={isMutating || !selectedPresetIds.length}
                  className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                >
                  {isMutating ? "Adding…" : "Add " + (selectedPresetIds.length || "") + " preset" + (selectedPresetIds.length === 1 ? "" : "s")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <h2 className="text-xl font-bold text-gray-800">
        Manage Events for {tournament.name}
      </h2>

      {statusMessage && (
        <div className={`rounded border px-3 py-2 text-sm ${statusClasses}`}>
          {statusMessage}
        </div>
      )}

      <div className="rounded border border-dashed border-blue-200 bg-blue-50 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-blue-800">Quick Add Categories</h3>
            <p className="text-sm text-blue-700">
              Instantly create all required events for common tournament categories. You can
              still customise each event afterwards.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowPresetWizard(true)}
            className="rounded border border-blue-400 bg-white px-3 py-2 text-sm font-medium text-blue-700 shadow-sm transition hover:border-blue-500 hover:bg-blue-100"
          >
            Open category selector
          </button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {CATEGORY_PRESETS.map(preset => (
            <button
              key={preset.id}
              type="button"
              onClick={() => handleAddPreset(preset)}
              disabled={isMutating}
              className="rounded border border-blue-200 bg-white px-3 py-2 text-left shadow-sm transition hover:border-blue-400 hover:shadow disabled:cursor-not-allowed disabled:opacity-60"
            >
              <div className="font-medium text-blue-700">{preset.label}</div>
              <div className="text-xs text-gray-600">{preset.description}</div>
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={handleSubmitEvent} className="rounded border bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-lg font-semibold text-gray-800">
            {editingEvent ? "Edit event" : "Add a custom event"}
          </h3>
          {editingEvent && (
            <button
              type="button"
              onClick={handleCancelEdit}
              className="text-sm text-blue-600 underline"
              disabled={isMutating}
            >
              Cancel editing
            </button>
          )}
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-sm font-medium text-gray-700">
            Event Type
            <select
              value={form.event_type}
              onChange={event => setForm(current => ({ ...current, event_type: event.target.value }))}
              className="mt-1 block w-full rounded border px-3 py-2"
              disabled={disableForm}
              required
            >
              <option value="" disabled>
                Select…
              </option>
              {eventTypeOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-gray-700">
            Age Group
            <select
              value={form.age_group}
              onChange={event => setForm(current => ({ ...current, age_group: event.target.value }))}
              className="mt-1 block w-full rounded border px-3 py-2"
              disabled={disableForm}
              required
            >
              <option value="" disabled>
                Select…
              </option>
              {ageGroupOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-gray-700">
            Gender
            <select
              value={form.gender}
              onChange={event => setForm(current => ({ ...current, gender: event.target.value as FormState["gender"] }))}
              className="mt-1 block w-full rounded border px-3 py-2"
              disabled={disableForm}
            >
              {genderOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-gray-700">
            Skill Level
            <select
              value={form.skill_level}
              onChange={event => setForm(current => ({ ...current, skill_level: event.target.value }))}
              className="mt-1 block w-full rounded border px-3 py-2"
              disabled={disableForm}
              required
            >
              <option value="" disabled>
                Select…
              </option>
              {skillLevelOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-gray-700">
            Registration Fee ({currencyCode})
            <input
              type="number"
              min={0}
              step="any"
              value={form.registration_fee}
              onChange={event => setForm(current => ({ ...current, registration_fee: event.target.value }))}
              className="mt-1 block w-full rounded border px-3 py-2"
              placeholder="0"
              disabled={isMutating}
            />
          </label>
          <label className="text-sm font-medium text-gray-700">
            Max Entries
            <input
              type="number"
              min={2}
              value={form.max_entries}
              onChange={event =>
                setForm(current => ({
                  ...current,
                  max_entries: Number(event.target.value) || current.max_entries,
                }))
              }
              className="mt-1 block w-full rounded border px-3 py-2"
              disabled={isMutating}
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={disableForm}
          className="mt-4 rounded bg-blue-600 px-4 py-2 font-semibold text-white shadow hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
        >
          {isMutating ? (editingEvent ? "Saving…" : "Adding…") : editingEvent ? "Save Changes" : "Add Event"}
        </button>
      </form>

      <div className="rounded border bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-lg font-semibold text-gray-800">Current Events</h3>
          <button
            type="button"
            onClick={() => setShowPresetWizard(true)}
            className="text-sm text-blue-600 underline"
          >
            Select categories in bulk
          </button>
        </div>
        {eventsLoading ? (
          <div className="mt-3 text-sm text-gray-600">Loading events…</div>
        ) : events.length === 0 ? (
          <div className="mt-3 rounded border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600">
            No events have been added yet. Use the preset selector or the custom form above to
            configure tournament categories.
          </div>
        ) : (
          <ul className="mt-3 space-y-3">
            {events.map(event => (
              <li
                key={event.id}
                className="flex flex-col gap-2 rounded border border-gray-200 bg-gray-50 p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="font-semibold text-gray-800">{buildEventLabel(event)}</div>
                  <div className="text-xs text-gray-600">
                    Fee: {currencyCode}{" "}
                    {Number(event.registration_fee ?? defaultRegistrationFee ?? 0).toFixed(2)} · Max entries:{" "}
                    {event.max_entries || 32}
                  </div>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                  <button
                    type="button"
                    onClick={() => handleEditEvent(event)}
                    disabled={isMutating}
                    className="rounded bg-blue-500 px-3 py-1 text-sm font-medium text-white shadow hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-blue-300"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteEvent(event.id)}
                    disabled={isMutating}
                    className="rounded bg-red-500 px-3 py-1 text-sm font-medium text-white shadow hover:bg-red-600 disabled:cursor-not-allowed disabled:bg-red-300"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="text-sm text-gray-500">
        Need to add more event types, age groups, or skill levels?&nbsp;
        <a
          href="/admin/manage-dropdown-options"
          className="text-blue-600 underline"
        >
          Manage Dropdown Options
        </a>
      </div>
    </div>
  );
};

export default ManageTournamentEvents;
