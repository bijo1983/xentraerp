import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Calendar, MapPin } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { GroupMonthlyBooking } from './GroupMonthlyBooking';
import { useCurrency } from '../../hooks/useCurrency';

type GroupProfile = {
  id: string;
  group_name: string;
  club_id: string;
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

        setGroupInfo(data as GroupProfile);
        await refreshData((data as GroupProfile).id);
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

  const clubName = groupInfo.club_users?.club_name ?? 'Club';

  return (
    <div className="space-y-8">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Monthly group bookings</h1>
          <p className="text-gray-600">Reserve recurring slots on behalf of your group.</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3">
          <p className="text-sm text-green-700 font-medium flex items-center gap-2">
            <MapPin className="h-4 w-4" /> {clubName}
          </p>
          <p className="text-xs text-green-600">Group: {groupInfo.group_name}</p>
        </div>
      </div>

      {showPlanner && (
        <GroupMonthlyBooking
          clubId={groupInfo.club_id}
          groupId={groupInfo.id}
          groupName={groupInfo.group_name}
          mode="group"
          onSubmitted={() => void refreshData(groupInfo.id)}
        />
      )}

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
