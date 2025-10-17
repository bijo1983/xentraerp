import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Calendar, Loader2, MapPin, Search } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { GroupMonthlyBooking } from './GroupMonthlyBooking';
import { useCurrency } from '../../hooks/useCurrency';

type GroupProfile = {
  id: string;
  group_name: string;
  club_id: string | null;
  club_users?: {
    club_name: string;
  } | null;
};

type GroupBookingRow = {
  id: string;
  status: string;
  total_amount: number;
  booking_date: string;
  court_slots?: {
    date: string;
    start_time: string;
    end_time: string;
    courts?: {
      name: string;
    } | null;
  } | null;
};

type GroupBatchRow = {
  id: string;
  booking_month: string;
  total_amount: number;
  status: string;
  booking_type: string;
  booking_count?: number | null;
  created_at: string;
};

type ClubOption = {
  id: string;
  club_name: string;
  countries?: {
    name?: string | null;
  } | null;
};

type GroupBookingPageProps = {
  showPlanner?: boolean;
};

export const GroupBookingPage: React.FC<GroupBookingPageProps> = ({ showPlanner = true }) => {
  const { userProfile } = useAuthStore();
  const { formatPrice } = useCurrency();

  const [groupInfo, setGroupInfo] = useState<GroupProfile | null>(null);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [loadingGroup, setLoadingGroup] = useState(true);

  const [bookings, setBookings] = useState<GroupBookingRow[]>([]);
  const [batches, setBatches] = useState<GroupBatchRow[]>([]);
  const [loadingData, setLoadingData] = useState(false);

  const [plannerClub, setPlannerClub] = useState<{
    id: string;
    name: string;
    location?: string | null;
  } | null>(null);
  const [clubSearchTerm, setClubSearchTerm] = useState('');
  const [clubResults, setClubResults] = useState<ClubOption[]>([]);
  const [searchingClubs, setSearchingClubs] = useState(false);
  const [clubSearchError, setClubSearchError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!userProfile?.user_id) {
        setGroupInfo(null);
        setLoadingGroup(false);
        return;
      }

      setLoadingGroup(true);
      setGroupError(null);

      try {
        const { data, error } = await supabase
          .from('group_users')
          .select('id, group_name, club_id, club_users (club_name)')
          .eq('user_id', userProfile.user_id)
          .maybeSingle();

        if (error) {
          console.error('[GroupBookingPage] load group error', error);
          setGroupError('Unable to load group profile.');
          setGroupInfo(null);
          return;
        }

        if (!data) {
          setGroupError('No group profile found for this account.');
          setGroupInfo(null);
          return;
        }

        const profile = data as GroupProfile;
        setGroupInfo(profile);
        await refreshData(profile.id);
      } catch (err) {
        console.error('[GroupBookingPage] load group exception', err);
        setGroupError('Unable to load group profile.');
        setGroupInfo(null);
      } finally {
        setLoadingGroup(false);
      }
    };

    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfile?.user_id]);

  useEffect(() => {
    if (groupInfo?.club_id && groupInfo.club_users?.club_name) {
      setPlannerClub((current) =>
        current?.id
          ? current
          : {
              id: groupInfo.club_id!,
              name: groupInfo.club_users!.club_name,
            }
      );
    }
  }, [groupInfo?.club_id, groupInfo?.club_users?.club_name]);

  const refreshData = async (groupId: string) => {
    setLoadingData(true);
    try {
      const [{ data: bookingRows }, { data: batchRows }] = await Promise.all([
        supabase
          .from('bookings')
          .select(
            `id, status, total_amount, booking_date, court_slots (date, start_time, end_time, courts (name))`
          )
          .eq('group_id', groupId)
          .order('booking_date', { ascending: false })
          .limit(8),
        supabase
          .from('booking_batches')
          .select('id, booking_month, total_amount, status, booking_type, booking_count, created_at')
          .eq('group_id', groupId)
          .order('created_at', { ascending: false })
          .limit(6),
      ]);

      setBookings((bookingRows ?? []) as GroupBookingRow[]);
      setBatches((batchRows ?? []) as GroupBatchRow[]);
    } catch (err) {
      console.error('[GroupBookingPage] refreshData exception', err);
    } finally {
      setLoadingData(false);
    }
  };

  const resolveLocation = (club: ClubOption) =>
    [club.countries?.name].filter(Boolean).join(', ') || null;

  const searchClubs = async () => {
    setSearchingClubs(true);
    setClubSearchError(null);
    try {
      const trimmed = clubSearchTerm.trim();
      let query = supabase
        .from('club_users')
        .select('id, club_name, countries (name)')
        .eq('approval_status', 'approved')
        .eq('is_visible', true)
        .order('club_name', { ascending: true });

      if (trimmed) {
        query = query.ilike('club_name', `%${trimmed}%`);
      }

      const { data, error } = await query.limit(10);

      if (error) {
        console.error('[GroupBookingPage] club search error', error);
        setClubResults([]);
        setClubSearchError('Unable to search clubs right now. Please try again.');
        return;
      }

      const rows = ((data ?? []) as ClubOption[]).filter(
        (club) => Boolean(club.id) && Boolean(club.club_name)
      );

      setClubResults(rows);
    } catch (err) {
      console.error('[GroupBookingPage] club search exception', err);
      setClubResults([]);
      setClubSearchError('Unable to search clubs right now. Please try again.');
    } finally {
      setSearchingClubs(false);
    }
  };

  const handleSelectClub = (club: ClubOption) => {
    setPlannerClub({
      id: club.id,
      name: club.club_name,
      location: resolveLocation(club),
    });
  };

  const useAssignedClub = () => {
    if (!groupInfo?.club_id || !groupInfo.club_users?.club_name) return;
    setPlannerClub({
      id: groupInfo.club_id,
      name: groupInfo.club_users.club_name,
    });
  };

  if (loadingGroup) {
    return (
      <div className="p-8 text-center text-gray-600">Loading group information…</div>
    );
  }

  if (groupError) {
    return (
      <div className="p-8 text-center text-red-600 bg-red-50 border border-red-200 rounded-xl">{groupError}</div>
    );
  }

  if (!groupInfo) {
    return (
      <div className="p-8 text-center text-gray-600 bg-white border border-gray-200 rounded-xl">
        Sign out and sign back in after your club administrator assigns this account to a group.
      </div>
    );
  }

  const assignedClubName = groupInfo.club_users?.club_name ?? 'No club assigned';
  const hasClubAssigned = Boolean(groupInfo.club_id);
  const plannerHasClub = Boolean(plannerClub?.id);
  const plannerMatchesAssigned =
    plannerHasClub && hasClubAssigned && plannerClub?.id === groupInfo.club_id;
  const plannerLocation = plannerClub?.location;
  const plannerStatusMessage = plannerHasClub
    ? plannerMatchesAssigned
      ? 'Planning with your assigned club.'
      : 'Planning with a different approved club.'
    : 'Select a club below to begin monthly planning.';

  const plannerSection = showPlanner ? (
    <GroupMonthlyBooking
      clubId={plannerClub?.id ?? ''}
      groupId={groupInfo.id}
      groupName={groupInfo.group_name}
      mode="group"
      disabled={!plannerHasClub}
      onSubmitted={() => void refreshData(groupInfo.id)}
      noClubMessage="Select a club from the search above to load the monthly planner."
    />
  ) : null;

  return (
    <div className="space-y-8">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Monthly group bookings</h1>
          <p className="text-gray-600">Reserve recurring slots on behalf of your group.</p>
        </div>
        <div
          className={`rounded-lg px-4 py-3 border ${
            plannerHasClub ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'
          }`}
        >
          <p
            className={`text-sm font-medium flex items-center gap-2 ${
              plannerHasClub ? 'text-green-700' : 'text-yellow-800'
            }`}
          >
            <MapPin className="h-4 w-4" /> {plannerHasClub ? plannerClub?.name : 'No club selected'}
          </p>
          {plannerLocation && (
            <p className={`text-xs mt-1 ${plannerHasClub ? 'text-green-600' : 'text-yellow-700'}`}>
              {plannerLocation}
            </p>
          )}
          <p className={`text-xs mt-1 ${plannerHasClub ? 'text-green-600' : 'text-yellow-700'}`}>
            {plannerStatusMessage}
          </p>
          <p className={`text-xs mt-1 ${plannerHasClub ? 'text-green-600' : 'text-yellow-700'}`}>
            Assigned club: {assignedClubName}
            {plannerHasClub && hasClubAssigned && !plannerMatchesAssigned ? ' (different)' : ''}
          </p>
          <p className={`text-xs mt-1 ${plannerHasClub ? 'text-green-600' : 'text-yellow-700'}`}>
            Group: {groupInfo.group_name}
          </p>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Select a club for monthly planning</h2>
          <p className="text-sm text-gray-600">
            Browse approved clubs and choose where your group would like to reserve slots. Selecting a club here doesn't
            change your official club assignment.
          </p>
        </div>
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={clubSearchTerm}
              onChange={(e) => {
                setClubSearchTerm(e.target.value);
                if (clubSearchError) setClubSearchError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void searchClubs();
                }
              }}
              className="w-full pl-9 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
              placeholder="Search by club name"
            />
          </div>
          <button
            type="button"
            onClick={() => void searchClubs()}
            disabled={searchingClubs}
            className="inline-flex items-center justify-center px-4 py-3 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 disabled:bg-green-300 disabled:cursor-not-allowed"
          >
            {searchingClubs ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" /> Searching…
              </>
            ) : (
              'Search clubs'
            )}
          </button>
          <button
            type="button"
            onClick={useAssignedClub}
            disabled={!hasClubAssigned || plannerClub?.id === groupInfo.club_id}
            className="inline-flex items-center justify-center px-4 py-3 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Use assigned club
          </button>
        </div>
        {clubSearchError && <p className="text-xs text-red-600">{clubSearchError}</p>}
        {clubResults.length > 0 && (
          <ul className="space-y-2">
            {clubResults.map((club) => {
              const isActive = plannerClub?.id === club.id;
              const location = resolveLocation(club);
              return (
                <li
                  key={club.id}
                  className="flex items-center justify-between border border-gray-200 rounded-lg p-3"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">{club.club_name}</p>
                    {location && <p className="text-xs text-gray-500">{location}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSelectClub(club)}
                    className={`px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
                      isActive
                        ? 'bg-green-100 text-green-700 border-green-300 cursor-default'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                    disabled={isActive}
                  >
                    {isActive ? 'Selected' : 'Use this club'}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {!searchingClubs && !clubSearchError && clubResults.length === 0 && clubSearchTerm.trim() && (
          <p className="text-sm text-gray-500">
            No clubs matched "{clubSearchTerm.trim()}". Try another search.
          </p>
        )}
        {!plannerHasClub && !clubSearchTerm.trim() && !searchingClubs && clubResults.length === 0 && (
          <p className="text-xs text-gray-500">
            {hasClubAssigned
              ? 'Use your assigned club or search for another approved location.'
              : 'Search for an approved club to begin monthly planning.'}
          </p>
        )}
      </div>

      {plannerSection}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Recent booking batches</h2>
            {loadingData && <span className="text-xs text-gray-500">Refreshing…</span>}
          </div>
        {batches.length === 0 ? (
            <p className="text-sm text-gray-600">No batch submissions yet.</p>
          ) : (
            <ul className="space-y-3">
              {batches.map((batch) => (
                <li key={batch.id} className="p-3 border border-gray-200 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {format(new Date(batch.booking_month), 'MMMM yyyy')}
                      </p>
                      <p className="text-xs text-gray-500 capitalize">{batch.booking_type.replace('_', ' ')}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-gray-900">{formatPrice(batch.total_amount)}</p>
                      <p className="text-xs text-gray-500">Slots: {batch.booking_count ?? '—'}</p>
                    </div>
                  </div>
                  <div className="mt-2">
                    <span
                      className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
                        batch.status === 'approved'
                          ? 'bg-green-100 text-green-800'
                          : batch.status === 'pending'
                          ? 'bg-yellow-100 text-yellow-800'
                          : batch.status === 'completed'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {batch.status}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Latest bookings</h2>
            {loadingData && <span className="text-xs text-gray-500">Refreshing…</span>}
          </div>
          {bookings.length === 0 ? (
            <p className="text-sm text-gray-600">No bookings recorded yet.</p>
          ) : (
            <ul className="space-y-3">
              {bookings.map((booking) => (
                <li key={booking.id} className="p-3 border border-gray-200 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-gray-700">
                      <p className="font-medium text-gray-900 flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-green-600" />
                        {booking.court_slots?.date
                          ? format(new Date(booking.court_slots.date), 'dd MMM yyyy')
                          : 'TBD'}
                      </p>
                      <p className="text-xs text-gray-500">
                        {booking.court_slots?.start_time} – {booking.court_slots?.end_time}
                      </p>
                      <p className="text-xs text-gray-500">
                        {booking.court_slots?.courts?.name ?? 'Court'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-gray-900">{formatPrice(booking.total_amount)}</p>
                      <span
                        className={`inline-block mt-1 px-2 py-1 rounded-full text-xs font-medium ${
                          booking.status === 'approved'
                            ? 'bg-green-100 text-green-800'
                            : booking.status === 'pending'
                            ? 'bg-yellow-100 text-yellow-800'
                            : booking.status === 'completed'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {booking.status}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};
