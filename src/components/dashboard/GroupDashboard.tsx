import React, { useEffect, useState } from 'react';
import { Calendar, MapPin } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { useCurrency } from '../../hooks/useCurrency';

interface GroupDashboardStats {
  total: number;
  pending: number;
  approved: number;
  lastBatchAmount: number;
  lastBatchMonth: string | null;
  nextBooking: string | null;
}

interface GroupRecord {
  id: string;
  group_name: string | null;
  club_users: { club_name: string | null } | null;
}

export const GroupDashboard: React.FC = () => {
  const { userProfile } = useAuthStore();
  const { formatPrice } = useCurrency();

  const [groupContext, setGroupContext] = useState<{
    id: string;
    name: string;
    clubName: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<GroupDashboardStats | null>(null);

  useEffect(() => {
    const loadDashboard = async () => {
      if (!userProfile?.user_id) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const { data: groupRecord, error: groupError } = await supabase
          .from('group_users')
          .select('id, group_name, club_users (club_name)')
          .eq('user_id', userProfile.user_id)
          .maybeSingle();

        if (groupError) {
          console.error('[GroupDashboard] load group error', groupError);
          setLoading(false);
          return;
        }

        if (!groupRecord) {
          setLoading(false);
          return;
        }

        const typedGroup = groupRecord as GroupRecord;
        const clubName = typedGroup.club_users?.club_name ?? null;

        setGroupContext({
          id: typedGroup.id,
          name: typedGroup.group_name ?? 'Group',
          clubName,
        });

        const [{ data: bookingRows }, { data: batchRows }] = await Promise.all([
          supabase
            .from('bookings')
            .select('status, court_slots (date)')
            .eq('group_id', typedGroup.id)
            .order('booking_date', { ascending: true })
            .limit(25),
          supabase
            .from('booking_batches')
            .select('total_amount, booking_month')
            .eq('group_id', typedGroup.id)
            .order('created_at', { ascending: false })
            .limit(1),
        ]);

        const total = bookingRows?.length ?? 0;
        const pending = bookingRows?.filter((row) => row.status === 'pending').length ?? 0;
        const approved = bookingRows?.filter((row) => row.status === 'approved').length ?? 0;
        const nextBooking = bookingRows?.find((row) => (row.court_slots as any)?.date)?.court_slots?.date ?? null;

        const lastBatch = (batchRows ?? [])[0];

        setStats({
          total,
          pending,
          approved,
          lastBatchAmount: lastBatch?.total_amount ?? 0,
          lastBatchMonth: lastBatch?.booking_month ?? null,
          nextBooking: nextBooking,
        });
      } catch (err) {
        console.error('[GroupDashboard] load dashboard exception', err);
      } finally {
        setLoading(false);
      }
    };

    void loadDashboard();
  }, [userProfile?.user_id]);

  const groupId = groupContext?.id ?? '';
  const groupName = groupContext?.name ?? 'Group';
  const clubName = groupContext?.clubName ?? 'No club assigned';
  const clubAssigned = Boolean(groupContext?.clubName);

  if (loading) {
    return <div className="p-6 text-center text-gray-600">Loading dashboard…</div>;
  }

  if (!groupId) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-600">
        This account is not linked to a group yet. Contact your club administrator for access.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-xl p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Welcome, {groupName}</h1>
          <p className="text-gray-600">
            {clubAssigned
              ? 'Plan your monthly schedule and track approvals.'
              : 'Browse clubs in your country and connect with an administrator to start planning together.'}
          </p>
        </div>
        <div
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm border ${
            clubAssigned
              ? 'text-green-700 bg-green-50 border-green-200'
              : 'text-yellow-700 bg-yellow-50 border-yellow-200'
          }`}
        >
          <MapPin className="h-4 w-4" /> {clubName}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-sm text-gray-500">Total bookings</p>
          <p className="text-2xl font-bold text-gray-900">{stats?.total ?? 0}</p>
          <p className="text-xs text-gray-500 mt-2">Approved: {stats?.approved ?? 0}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-sm text-gray-500">Pending approvals</p>
          <p className="text-2xl font-bold text-yellow-600">{stats?.pending ?? 0}</p>
          <p className="text-xs text-gray-500 mt-2">Awaiting club confirmation</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-sm text-gray-500">Last submission</p>
          <p className="text-2xl font-bold text-gray-900">{formatPrice(stats?.lastBatchAmount ?? 0)}</p>
          <p className="text-xs text-gray-500 mt-2">
            {stats?.lastBatchMonth ? format(new Date(stats.lastBatchMonth), 'MMMM yyyy') : 'No submissions yet'}
          </p>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Calendar className="h-5 w-5 text-green-600" /> Upcoming booking
        </h2>
        {stats?.nextBooking ? (
          <p className="text-gray-700">Next slot scheduled on {format(new Date(stats.nextBooking), 'dd MMM yyyy')}.</p>
        ) : (
          <p className="text-gray-500 text-sm">
            {clubAssigned
              ? 'No upcoming slots. Submit your monthly plan to secure timings.'
              : 'Link your group to a club to submit a monthly plan. You can still explore all available slots below.'}
          </p>
        )}
        <div className="mt-4 flex gap-3 flex-wrap">
          <a
            href="/book-court"
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              clubAssigned
                ? 'bg-green-600 text-white hover:bg-green-700'
                : 'bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100'
            }`}
          >
            {clubAssigned ? 'Plan monthly slots' : 'Browse clubs & slots'}
          </a>
          <a
            href="/my-bookings"
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-100"
          >
            View booking history
          </a>
        </div>
      </div>
    </div>
  );
};
