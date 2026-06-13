import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import EventRegistrationModal from '../EventRegistrationModal';
import { useAuthStore } from '../../../store/authStore';

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
  hosted_by: 'club' | 'organizer';
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
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString();
};

const formatEventLabel = (event: TournamentEventSummary) => {
  const parts = [event.event_type];
  if (event.age_group) parts.push(event.age_group);
  if (event.skill_level) parts.push(event.skill_level);
  if (event.gender) parts.push(event.gender);
  return parts.filter(Boolean).join(' · ');
};

export const PlayerJoinTournaments: React.FC = () => {
  const { userProfile } = useAuthStore();
  const [countries, setCountries] = useState<CountryRow[]>([]);
  const [countriesLoading, setCountriesLoading] = useState(false);
  const [allTournaments, setAllTournaments] = useState<PublicTournament[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<string>('');
  const [filteredTournaments, setFilteredTournaments] = useState<PublicTournament[]>([]);
  const [selectedTournament, setSelectedTournament] = useState<PublicTournament | null>(null);
  const [events, setEvents] = useState<TournamentEventSummary[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [modalEvent, setModalEvent] = useState<TournamentEventSummary | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [countryInitialized, setCountryInitialized] = useState(false);

  const countryMap = useMemo(() => {
    const map = new Map<string, CountryRow>();
    countries.forEach(country => {
      map.set(country.id, country);
    });
    return map;
  }, [countries]);

  const resolvedCurrency = useMemo(() => {
    if (!selectedTournament) return 'USD';
    const direct = selectedTournament.currency_code;
    if (direct) return direct;
    if (selectedTournament.country_id) {
      return countryMap.get(selectedTournament.country_id)?.currency_code || 'USD';
    }
    return 'USD';
  }, [selectedTournament, countryMap]);

  useEffect(() => {
    const fetchCountries = async () => {
      setCountriesLoading(true);
      const { data, error } = await supabase
        .from('countries')
        .select('id, name, code, currency_code')
        .order('name');

      if (error) {
        console.error('Failed to load countries', error);
      }

      setCountries(data || []);
      setCountriesLoading(false);
    };

    const loadOpenTournaments = async () => {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from('tournaments')
        .select('id, name, description, location, start_date, end_date, registration_deadline, status, hosted_by, organizer_id, currency_code')
        .eq('status', 'registration_open')
        .order('start_date', { ascending: true });

      if (error) {
        console.error('Failed to load tournaments', error);
        setError('Unable to load open tournaments. Please try again later.');
        setAllTournaments([]);
        setLoading(false);
        return;
      }

      const tournaments = (data || []) as any[];
      const clubIds = Array.from(new Set(tournaments.filter(t => t.hosted_by === 'club').map(t => t.organizer_id))).filter(Boolean);
      const organizerIds = Array.from(new Set(tournaments.filter(t => t.hosted_by === 'organizer').map(t => t.organizer_id))).filter(Boolean);

      const clubPromise = clubIds.length
        ? supabase
            .from('club_users')
            .select('id, club_name, country_id')
            .in('id', clubIds)
        : Promise.resolve({ data: [] as any[], error: null });

      const organizerPromise = organizerIds.length
        ? supabase
            .from('organizer_users')
            .select('id, organizer_name, country_id')
            .in('id', organizerIds)
        : Promise.resolve({ data: [] as any[], error: null });

      const [clubRes, organizerRes] = await Promise.all([clubPromise, organizerPromise]);

      if (clubRes.error) {
        console.error('Failed to load club hosts', clubRes.error);
      }
      if (organizerRes.error) {
        console.error('Failed to load organizer hosts', organizerRes.error);
      }

      const clubMap = new Map<string, any>();
      (clubRes.data || []).forEach((row: any) => clubMap.set(row.id, row));

      const organizerMap = new Map<string, any>();
      (organizerRes.data || []).forEach((row: any) => organizerMap.set(row.id, row));

      const enriched: PublicTournament[] = tournaments.map(t => {
        const host = t.hosted_by === 'club' ? clubMap.get(t.organizer_id) : organizerMap.get(t.organizer_id);
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
          host_name: host?.club_name ?? host?.organizer_name ?? null,
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

    if (userProfile?.country_id) {
      setSelectedCountry(userProfile.country_id);
    } else {
      setSelectedCountry('');
    }

    setCountryInitialized(true);
  }, [countries, userProfile?.country_id, countryInitialized]);

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
        .from('tournament_events')
        .select('id, event_type, age_group, gender, skill_level, registration_fee, max_entries')
        .eq('tournament_id', selectedTournament.id)
        .order('event_type', { ascending: true });

      if (error) {
        console.error('Failed to load tournament events', error);
        setEvents([]);
        setEventsError('Unable to load categories for this tournament.');
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

  const handleRegistrationSuccess = (event: TournamentEventSummary) => {
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
                              ? 'border-primary-300 bg-primary-50 text-primary-700'
                              : 'border-transparent bg-background-subtle hover:bg-background'
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
                      {selectedTournament.location || 'Location to be announced'}
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
                              {event.max_entries ? ` · Max entries: ${event.max_entries}` : ''}
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
          onSuccess={() => handleRegistrationSuccess(modalEvent)}
        />
      )}
    </div>
  );
};

export default PlayerJoinTournaments;
