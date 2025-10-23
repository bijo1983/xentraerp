import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";

interface TournamentEventSummary {
  id: string;
  event_type: string;
  gender?: string | null;
  age_group?: string | null;
  skill_level?: string | null;
}

interface Props {
  tournamentId: string;
}

interface RoundPlan {
  label: string;
  matches: number;
  daySuggestion: string;
  matchesPerDay: number;
  estimatedDailyHours: number;
}

interface FixturePlan {
  eventId: string;
  eventLabel: string;
  totalEntries: number;
  bracketSize: number;
  byes: number;
  totalMatches: number;
  firstRoundDays: number;
  maxMatchHours: number;
  rounds: RoundPlan[];
  warnings: string[];
}

interface GenerationFormState {
  selectedEventIds: string[];
  firstRoundDays: number;
  maxMatchHours: number;
  semiFinalDayOffset: number;
  finalDayOffset: number;
}

const formatEventLabel = (event: TournamentEventSummary) => {
  const parts: string[] = [];
  if (event.event_type) parts.push(event.event_type);
  if (event.age_group) parts.push(event.age_group);
  if (event.skill_level) parts.push(event.skill_level);
  if (event.gender) {
    const gender = event.gender.charAt(0).toUpperCase() + event.gender.slice(1);
    parts.push(gender);
  }
  return parts.length ? parts.join(" · ") : event.id;
};

const nextPowerOfTwo = (value: number) => {
  if (value <= 1) return Math.max(1, value);
  return 1 << Math.ceil(Math.log2(value));
};

const getRoundName = (participants: number) => {
  if (participants <= 2) return "Final";
  if (participants === 4) return "Semi-final";
  if (participants === 8) return "Quarter-final";
  if (participants >= 16) return "Round of " + participants;
  return "Round";
};

const computeFixturePlan = (
  event: TournamentEventSummary,
  entries: number,
  form: GenerationFormState,
): FixturePlan => {
  const safeEntries = Math.max(0, entries);
  const bracketSize = safeEntries <= 1 ? Math.max(1, safeEntries) : nextPowerOfTwo(safeEntries);
  const totalRounds = bracketSize > 1 ? Math.round(Math.log2(bracketSize)) : 0;
  const byes = Math.max(0, bracketSize - safeEntries);
  const rounds: RoundPlan[] = [];
  const safeFirstRoundDays = Math.max(1, form.firstRoundDays);
  const safeMaxMatchHours = Math.max(0.25, form.maxMatchHours);

  let matchesThisRound = bracketSize / 2;
  for (let roundIndex = 0; roundIndex < totalRounds; roundIndex += 1) {
    let matches = Math.max(0, matchesThisRound);
    if (roundIndex === 0) {
      matches = Math.max(0, matchesThisRound - byes);
    }

    const participantsInRound = bracketSize / Math.pow(2, roundIndex);
    const label = getRoundName(participantsInRound);
    let daySuggestion = "Day " + (roundIndex + 1);
    if (roundIndex === 0) {
      daySuggestion = safeFirstRoundDays === 1 ? "Day 1" : "Days 1-" + safeFirstRoundDays;
    } else if (roundIndex === totalRounds - 2) {
      daySuggestion = "Day " + Math.max(form.semiFinalDayOffset, safeFirstRoundDays + 1);
    } else if (roundIndex === totalRounds - 1) {
      daySuggestion = "Day " + Math.max(form.finalDayOffset, form.semiFinalDayOffset + 1);
    }

    let matchesPerDay = matches;
    if (roundIndex === 0) {
      matchesPerDay = matches === 0 ? 0 : Math.max(1, Math.ceil(matches / safeFirstRoundDays));
    }
    const estimatedHours = matchesPerDay === 0 ? 0 : Number((matchesPerDay * safeMaxMatchHours).toFixed(2));

    rounds.push({
      label,
      matches,
      daySuggestion,
      matchesPerDay,
      estimatedDailyHours: estimatedHours,
    });

    matchesThisRound = matchesThisRound / 2;
  }

  const warnings: string[] = [];
  if (safeEntries < 2) {
    warnings.push("Not enough confirmed registrations to create a full bracket.");
  }
  if (form.semiFinalDayOffset <= safeFirstRoundDays) {
    warnings.push("Semi-finals are scheduled before or during the last first-round day.");
  }
  if (form.finalDayOffset <= Math.max(form.semiFinalDayOffset, safeFirstRoundDays)) {
    warnings.push("Finals are scheduled before semi-finals have been completed.");
  }
  if (byes > 0) {
    warnings.push(byes + (byes === 1 ? " participant receives a bye." : " participants receive byes."));
  }

  return {
    eventId: event.id,
    eventLabel: formatEventLabel(event),
    totalEntries: safeEntries,
    bracketSize: bracketSize,
    byes,
    totalMatches: bracketSize > 1 ? bracketSize - 1 : 0,
    firstRoundDays: safeFirstRoundDays,
    maxMatchHours: safeMaxMatchHours,
    rounds,
    warnings,
  };
};

const TournamentFixturesPanel: React.FC<Props> = ({ tournamentId }) => {
  const [events, setEvents] = useState<TournamentEventSummary[]>([]);
  const [registrationCounts, setRegistrationCounts] = useState<Record<string, number>>({});
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusType, setStatusType] = useState<"success" | "error" | "info" | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [fixturePlans, setFixturePlans] = useState<Record<string, FixturePlan>>({});
  const [generationForm, setGenerationForm] = useState<GenerationFormState>({
    selectedEventIds: [],
    firstRoundDays: 1,
    maxMatchHours: 1.0,
    semiFinalDayOffset: 3,
    finalDayOffset: 4,
  });

  useEffect(() => {
    const fetchEvents = async () => {
      setLoading(true);
      setError(null);
      setStatusMessage(null);
      try {
        const { data, error: eventError } = await supabase
          .from("tournament_events")
          .select("id, event_type, gender, age_group, skill_level")
          .eq("tournament_id", tournamentId)
          .order("event_type");

        if (eventError) {
          throw eventError;
        }

        const eventList = data || [];
        setEvents(eventList);
        setSelectedEventId(eventList.length ? eventList[0].id : null);
        await fetchRegistrationCounts(eventList.map(item => item.id));
      } catch (fetchError: any) {
        setEvents([]);
        setRegistrationCounts({});
        setSelectedEventId(null);
        setError(fetchError?.message || "Unable to load events for fixtures.");
      }
      setLoading(false);
    };

    fetchEvents();
  }, [tournamentId]);

  const fetchRegistrationCounts = async (eventIds: string[]) => {
    if (!eventIds.length) {
      setRegistrationCounts({});
      return;
    }

    try {
      const { data, error: regError } = await supabase
        .from("tournament_registrations")
        .select("tournament_event_id")
        .eq("tournament_id", tournamentId)
        .in("tournament_event_id", eventIds);

      if (regError) {
        throw regError;
      }

      const counts: Record<string, number> = {};
      (data || []).forEach((row: any) => {
        const key = row.tournament_event_id;
        counts[key] = (counts[key] || 0) + 1;
      });
      setRegistrationCounts(counts);
    } catch (primaryError: any) {
      try {
        const { data, error: fallbackError } = await supabase
          .from("event_entries")
          .select("event_id")
          .in("event_id", eventIds);

        if (fallbackError) {
          throw fallbackError;
        }

        const counts: Record<string, number> = {};
        (data || []).forEach((row: any) => {
          const key = row.event_id;
          counts[key] = (counts[key] || 0) + 1;
        });
        setRegistrationCounts(counts);
        setStatusType("info");
        setStatusMessage("Participant counts are based on event entries because tournament registrations were unavailable.");
      } catch (secondaryError: any) {
        setRegistrationCounts({});
        setStatusType("error");
        setStatusMessage(
          secondaryError?.message || primaryError?.message || "Unable to determine registration counts.",
        );
      }
    }
  };

  const selectedEvent = useMemo(() => {
    return events.find(event => event.id === selectedEventId) || null;
  }, [events, selectedEventId]);

  const selectedPlan = selectedEvent ? fixturePlans[selectedEvent.id] : undefined;

  const totalRegistrations = useMemo(() => {
    return events.reduce((total, event) => total + (registrationCounts[event.id] || 0), 0);
  }, [events, registrationCounts]);

  const openWizard = () => {
    const selectedIds = selectedEventId ? [selectedEventId] : events.map(event => event.id);
    setGenerationForm(current => ({
      ...current,
      selectedEventIds: selectedIds,
    }));
    setShowWizard(true);
    setStatusMessage(null);
    setStatusType(null);
  };

  const handleWizardGenerate = () => {
    if (!generationForm.selectedEventIds.length) {
      setStatusType("error");
      setStatusMessage("Select at least one category to generate fixtures for.");
      return;
    }

    const newPlans: Record<string, FixturePlan> = { ...fixturePlans };
    generationForm.selectedEventIds.forEach(eventId => {
      const event = events.find(item => item.id === eventId);
      if (!event) return;
      const entries = registrationCounts[eventId] || 0;
      newPlans[eventId] = computeFixturePlan(event, entries, generationForm);
    });

    setFixturePlans(newPlans);
    setShowWizard(false);
    setStatusType("success");
    setStatusMessage("Fixture plans generated for " + generationForm.selectedEventIds.length + " categor" + (generationForm.selectedEventIds.length === 1 ? "y" : "ies") + ".");
    if (!generationForm.selectedEventIds.includes(selectedEventId || "")) {
      setSelectedEventId(generationForm.selectedEventIds[0] || null);
    }
  };

  const closeWizard = () => {
    setShowWizard(false);
  };

  const toggleWizardEvent = (eventId: string) => {
    setGenerationForm(current => {
      const selected = current.selectedEventIds.includes(eventId)
        ? current.selectedEventIds.filter(id => id !== eventId)
        : [...current.selectedEventIds, eventId];
      return { ...current, selectedEventIds: selected };
    });
  };

  const selectAllWizardEvents = () => {
    setGenerationForm(current => ({
      ...current,
      selectedEventIds: events.map(event => event.id),
    }));
  };

  const clearWizardEvents = () => {
    setGenerationForm(current => ({ ...current, selectedEventIds: [] }));
  };

  const updateFirstRoundDays = (value: number) => {
    setGenerationForm(current => {
      const safeValue = Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;
      const next: GenerationFormState = { ...current, firstRoundDays: safeValue };
      if (next.semiFinalDayOffset <= safeValue) {
        next.semiFinalDayOffset = safeValue + 1;
      }
      if (next.finalDayOffset <= next.semiFinalDayOffset) {
        next.finalDayOffset = next.semiFinalDayOffset + 1;
      }
      return next;
    });
  };

  const updateSemiFinalDayOffset = (value: number) => {
    setGenerationForm(current => {
      const minSemi = current.firstRoundDays + 1;
      const safeValue = Number.isFinite(value) && value > minSemi ? Math.floor(value) : minSemi;
      const next: GenerationFormState = { ...current, semiFinalDayOffset: safeValue };
      if (next.finalDayOffset <= safeValue) {
        next.finalDayOffset = safeValue + 1;
      }
      return next;
    });
  };

  const updateFinalDayOffset = (value: number) => {
    setGenerationForm(current => {
      const minFinal = current.semiFinalDayOffset + 1;
      const safeValue = Number.isFinite(value) && value > minFinal ? Math.floor(value) : minFinal;
      return { ...current, finalDayOffset: safeValue };
    });
  };

  const updateMaxMatchHours = (value: number) => {
    setGenerationForm(current => {
      const safeValue = Number.isFinite(value) && value >= 0.25 ? value : 1;
      return { ...current, maxMatchHours: Number(Math.max(0.25, safeValue).toFixed(2)) };
    });
  };

  const wizardEventOptions = useMemo(
    () =>
      events.map(event => ({
        id: event.id,
        label: formatEventLabel(event),
        registrations: registrationCounts[event.id] || 0,
      })),
    [events, registrationCounts],
  );

  const selectedEventCount = generationForm.selectedEventIds.length;
  const selectedEntries = useMemo(() => {
    return generationForm.selectedEventIds.reduce((total, eventId) => {
      return total + (registrationCounts[eventId] || 0);
    }, 0);
  }, [generationForm.selectedEventIds, registrationCounts]);

  const generatedEventCount = useMemo(
    () => Object.keys(fixturePlans).length,
    [fixturePlans],
  );

  const statusClasses = statusType
    ? statusType === "success"
      ? "border-green-300 bg-green-50 text-green-800"
      : statusType === "error"
        ? "border-red-300 bg-red-50 text-red-800"
        : "border-blue-200 bg-blue-50 text-blue-800"
    : "border-gray-200 bg-white text-gray-700";

  if (loading) {
    return <div className="p-4 text-sm text-gray-600">Loading fixture data…</div>;
  }

  if (error) {
    return <div className="p-4 text-sm text-red-600">{error}</div>;
  }

  if (!events.length) {
    return (
      <div className="space-y-4">
        {statusMessage && (
          <div className={`rounded border px-3 py-2 text-sm ${statusClasses}`}>{statusMessage}</div>
        )}
        <div className="rounded border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600">
          Configure tournament categories before generating fixtures. Once events are added, participant registrations
          will appear here for draw planning.
        </div>
      </div>
    );
  }

  return (
    <div className="relative space-y-6">
      {showWizard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold text-gray-800">Generate fixture plans</h3>
                <p className="mt-1 text-sm text-gray-600">
                  Select one or more categories and fine-tune the scheduling assumptions. The planner will estimate
                  rounds, daily workload, and highlight potential conflicts.
                </p>
              </div>
              <button
                type="button"
                onClick={closeWizard}
                className="rounded border border-gray-200 px-3 py-1 text-sm text-gray-600 hover:bg-gray-50"
              >
                Close
              </button>
            </div>

            <div className="mt-4 grid gap-6 md:grid-cols-3">
              <div className="space-y-3 md:col-span-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-gray-700">Tournament categories</h4>
                  <div className="flex gap-2 text-xs">
                    <button
                      type="button"
                      onClick={selectAllWizardEvents}
                      className="rounded border border-gray-200 px-2 py-1 text-gray-600 hover:bg-gray-50"
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      onClick={clearWizardEvents}
                      className="rounded border border-gray-200 px-2 py-1 text-gray-600 hover:bg-gray-50"
                    >
                      Clear
                    </button>
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {wizardEventOptions.map(option => (
                    <label
                      key={option.id}
                      className={`flex cursor-pointer items-start gap-3 rounded border p-3 shadow-sm transition hover:border-blue-300 ${
                        generationForm.selectedEventIds.includes(option.id)
                          ? "border-blue-500 bg-blue-50"
                          : "border-gray-200 bg-white"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={generationForm.selectedEventIds.includes(option.id)}
                        onChange={() => toggleWizardEvent(option.id)}
                        className="mt-1"
                      />
                      <div>
                        <div className="font-medium text-blue-700">{option.label}</div>
                        <div className="text-xs text-gray-600">Registrations: {option.registrations}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-4 rounded border bg-gray-50 p-4">
                <h4 className="text-sm font-semibold text-gray-700">Scheduling assumptions</h4>
                <label className="block text-xs font-medium uppercase text-gray-600">
                  First round spans (days)
                  <input
                    type="number"
                    min={1}
                    value={generationForm.firstRoundDays}
                    onChange={event => updateFirstRoundDays(Number(event.target.value))}
                    className="mt-1 w-full rounded border px-3 py-2 text-sm"
                  />
                </label>
                <label className="block text-xs font-medium uppercase text-gray-600">
                  Max hours per match
                  <input
                    type="number"
                    min={0.25}
                    step={0.25}
                    value={generationForm.maxMatchHours}
                    onChange={event => updateMaxMatchHours(Number(event.target.value))}
                    className="mt-1 w-full rounded border px-3 py-2 text-sm"
                  />
                </label>
                <label className="block text-xs font-medium uppercase text-gray-600">
                  Semi-finals on day
                  <input
                    type="number"
                    min={generationForm.firstRoundDays + 1}
                    value={generationForm.semiFinalDayOffset}
                    onChange={event => updateSemiFinalDayOffset(Number(event.target.value))}
                    className="mt-1 w-full rounded border px-3 py-2 text-sm"
                  />
                </label>
                <label className="block text-xs font-medium uppercase text-gray-600">
                  Finals on day
                  <input
                    type="number"
                    min={generationForm.semiFinalDayOffset + 1}
                    value={generationForm.finalDayOffset}
                    onChange={event => updateFinalDayOffset(Number(event.target.value))}
                    className="mt-1 w-full rounded border px-3 py-2 text-sm"
                  />
                </label>
                <div className="rounded border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                  Selected categories: <strong>{selectedEventCount}</strong>
                  <br />
                  Total registrations included: <strong>{selectedEntries}</strong>
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-3 border-t pt-4 md:flex-row md:items-center md:justify-between">
              <div className="text-xs text-gray-500">
                Fixture plans provide guidance only. Adjust actual scheduling based on court availability.
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={closeWizard}
                  className="rounded border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleWizardGenerate}
                  className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-blue-700"
                >
                  Generate plans
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="rounded border border-blue-100 bg-blue-50 p-4 text-sm text-blue-700">
        Generate fixture plans to estimate how many matches you will host each day. Update the scheduling inputs when
        court availability changes.
      </div>

      {statusMessage && (
        <div className={`rounded border px-3 py-2 text-sm ${statusClasses}`}>{statusMessage}</div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded border bg-white p-4 shadow-sm">
          <div className="text-xs uppercase text-gray-500">Configured categories</div>
          <div className="text-2xl font-semibold text-gray-800">{events.length}</div>
        </div>
        <div className="rounded border bg-white p-4 shadow-sm">
          <div className="text-xs uppercase text-gray-500">Total registrations</div>
          <div className="text-2xl font-semibold text-gray-800">{totalRegistrations}</div>
        </div>
        <div className="rounded border bg-white p-4 shadow-sm">
          <div className="text-xs uppercase text-gray-500">Plans generated</div>
          <div className="text-2xl font-semibold text-gray-800">{generatedEventCount}</div>
        </div>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h3 className="text-lg font-semibold text-gray-800">Categories</h3>
        <button
          type="button"
          onClick={openWizard}
          className="rounded border border-blue-400 bg-white px-3 py-2 text-sm font-medium text-blue-700 shadow-sm transition hover:border-blue-500 hover:bg-blue-100"
        >
          Open fixture planner
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        {events.map(event => {
          const registrations = registrationCounts[event.id] || 0;
          const hasPlan = Boolean(fixturePlans[event.id]);
          const isActive = selectedEventId === event.id;
          return (
            <button
              type="button"
              key={event.id}
              onClick={() => setSelectedEventId(event.id)}
              className={`flex min-w-[220px] flex-1 flex-col rounded border p-3 text-left shadow-sm transition ${
                isActive ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-white hover:border-blue-300"
              }`}
            >
              <span className="font-medium text-gray-800">{formatEventLabel(event)}</span>
              <span className="text-xs text-gray-600">Registrations: {registrations}</span>
              {hasPlan ? (
                <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-green-700">
                  Plan ready
                </span>
              ) : (
                <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-600">
                  Plan pending
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="rounded border bg-white p-4 shadow-sm">
        {!selectedEvent ? (
          <div className="text-sm text-gray-600">Select a category to view registration counts and fixture estimates.</div>
        ) : !selectedPlan ? (
          <div className="space-y-3 text-sm text-gray-600">
            <div>
              <strong>{formatEventLabel(selectedEvent)}</strong> currently has {registrationCounts[selectedEvent.id] || 0}
              {" "}
              registration{(registrationCounts[selectedEvent.id] || 0) === 1 ? "" : "s"}. Generate a fixture plan to see
              round-by-round projections.
            </div>
            <button
              type="button"
              onClick={openWizard}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-blue-700"
            >
              Plan this category
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-800">{selectedPlan.eventLabel}</h3>
                <p className="text-sm text-gray-600">
                  {selectedPlan.totalEntries} registration{selectedPlan.totalEntries === 1 ? "" : "s"} · bracket size
                  {" "}
                  {selectedPlan.bracketSize}
                  {selectedPlan.byes > 0 && (
                    <span>
                      {" "}· {selectedPlan.byes} bye{selectedPlan.byes === 1 ? "" : "s"}
                    </span>
                  )}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={openWizard}
                  className="rounded border border-blue-400 bg-white px-3 py-2 text-sm font-medium text-blue-700 shadow-sm transition hover:border-blue-500 hover:bg-blue-100"
                >
                  Regenerate plan
                </button>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded border bg-gray-50 p-3">
                <div className="text-xs uppercase text-gray-500">Total matches</div>
                <div className="text-xl font-semibold text-gray-800">{selectedPlan.totalMatches}</div>
              </div>
              <div className="rounded border bg-gray-50 p-3">
                <div className="text-xs uppercase text-gray-500">First round days</div>
                <div className="text-xl font-semibold text-gray-800">{selectedPlan.firstRoundDays}</div>
              </div>
              <div className="rounded border bg-gray-50 p-3">
                <div className="text-xs uppercase text-gray-500">Max hours per match</div>
                <div className="text-xl font-semibold text-gray-800">{selectedPlan.maxMatchHours}</div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold text-gray-600">Round</th>
                    <th className="px-4 py-2 text-left font-semibold text-gray-600">Matches</th>
                    <th className="px-4 py-2 text-left font-semibold text-gray-600">Suggested day(s)</th>
                    <th className="px-4 py-2 text-left font-semibold text-gray-600">Matches per day</th>
                    <th className="px-4 py-2 text-left font-semibold text-gray-600">Est. hours / day</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {selectedPlan.rounds.map(round => (
                    <tr key={round.label}>
                      <td className="px-4 py-2">{round.label}</td>
                      <td className="px-4 py-2">{round.matches}</td>
                      <td className="px-4 py-2">{round.daySuggestion}</td>
                      <td className="px-4 py-2">{round.matchesPerDay}</td>
                      <td className="px-4 py-2">{round.estimatedDailyHours}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {selectedPlan.warnings.length > 0 && (
              <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                <div className="font-semibold">Warnings</div>
                <ul className="mt-2 list-disc pl-5">
                  {selectedPlan.warnings.map((warning, index) => (
                    <li key={index}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default TournamentFixturesPanel;

