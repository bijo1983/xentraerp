// FILE: src/components/bookings/ApproveRequests.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { supabase } from '../../lib/supabase';
import { useCurrency } from '../../hooks/useCurrency';

// ===== Types =====
type RequestKind = 'single' | 'group' | 'batch';
type TypeFilter = 'all' | 'single' | 'group' | 'batch';
type StatusFilter = 'pending' | 'approved' | 'rejected' | 'all';

type SlotSummary = {
  slotId: string | null;
  slotDate: string;
  startTime: string;
  endTime: string;
  courtName: string | null;
  price: number | null;
};

type BookingRequestItem = {
  kind: 'single' | 'group';
  requestId: string;
  bookingId: string;
  status: string;
  totalAmount: number;
  playerName: string | null;
  groupName: string | null;
  createdAt: string | null;
  slot: SlotSummary;
};

type BatchRequestItem = {
  kind: 'batch';
  requestId: string;
  batchId: string;
  status: string;
  totalAmount: number;
  playerName: string | null;
  groupName: string | null;
  createdAt: string | null;
  slots: SlotSummary[];
};

type RequestItem = BookingRequestItem | BatchRequestItem;

type BookingRow = {
  id: string;
  status: string | null;
  total_amount: number | null;
  created_at: string | null;
  player_id: string | null;
  group_id: string | null;
  booking_batch_id: string | null;
  player_users?: { full_name: string | null } | null;
  group_users?: { group_name: string | null } | null;
  court_slots?: {
    id: string;
    date: string;
    start_time: string;
    end_time: string;
    courts?: {
      id: string;
      name: string | null;
      club_id: string;
    } | null;
  } | null;
};

type BatchItemRow = {
  id: string;
  status: string | null;
  price: number | null;
  slot_id: string | null;
  court_slots?: {
    id: string;
    date: string;
    start_time: string;
    end_time: string;
    courts?: {
      id: string;
      name: string | null;
      club_id: string;
    } | null;
  } | null;
  booking_batches?: {
    id: string;
    status: string | null;
    total_amount: number | null;
    created_at: string | null;
    group_id: string | null;
    player_id: string | null;
    notes?: string | null;
    group_users?: { group_name: string | null } | null;
    player_users?: { full_name: string | null } | null;
    club_id: string;
  } | null;
};

// ===== Helpers =====
const requestTypeLabels: Record<RequestKind, string> = {
  single: 'Single booking',
  group: 'Group booking',
  batch: 'Group batch request',
};

const statusClasses: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-600',
  completed: 'bg-sky-100 text-sky-800',
  default: 'bg-slate-100 text-slate-700',
};

const STATUS_FILTER_OPTIONS: { label: string; value: StatusFilter }[] = [
  { label: 'Pending', value: 'pending' },
  { label: 'Approved', value: 'approved' },
  { label: 'Rejected', value: 'rejected' },
  { label: 'All statuses', value: 'all' },
];

const TYPE_FILTER_OPTIONS: { label: string; value: TypeFilter }[] = [
  { label: 'All requests', value: 'all' },
  { label: 'Singles', value: 'single' },
  { label: 'Group', value: 'group' },
  { label: 'Group batches', value: 'batch' },
];

function formatSlotRange(slot: SlotSummary): string {
  if (!slot.slotDate) return '—';
  try {
    const start = new Date(`${slot.slotDate}T${slot.startTime || '00:00'}`);
    const end = new Date(`${slot.slotDate}T${slot.endTime || '00:00'}`);
    const dateLabel = format(start, 'EEE, dd MMM');
    const startLabel = Number.isNaN(start.getTime()) ? slot.startTime : format(start, 'hh:mm a');
    const endLabel = Number.isNaN(end.getTime()) ? slot.endTime : format(end, 'hh:mm a');
    return `${dateLabel} · ${startLabel ?? ''}${endLabel ? ` – ${endLabel}` : ''}`;
  } catch (error) {
    console.error('Failed to format slot range:', error);
    return `${slot.slotDate} ${slot.startTime ?? ''}${slot.endTime ? ` – ${slot.endTime}` : ''}`;
  }
}

function getSortTimestamp(request: RequestItem): number {
  if (request.createdAt) {
    const ts = new Date(request.createdAt).getTime();
    if (!Number.isNaN(ts)) return ts;
  }

  if (request.kind === 'batch') {
    const slot = request.slots[0];
    if (slot?.slotDate) {
      const ts = new Date(`${slot.slotDate}T${slot.startTime || '00:00'}`).getTime();
      return Number.isNaN(ts) ? 0 : ts;
    }
    return 0;
  }

  const slot = request.slot;
  if (slot?.slotDate) {
    const ts = new Date(`${slot.slotDate}T${slot.startTime || '00:00'}`).getTime();
    return Number.isNaN(ts) ? 0 : ts;
  }
  return 0;
}

function buildStatusList(filter: StatusFilter): string[] {
  if (filter === 'all') {
    return ['pending', 'approved', 'rejected'];
  }
  return [filter];
}

async function fetchBookingRequests(params: {
  clubId: string;
  statusFilter: StatusFilter;
}): Promise<BookingRequestItem[]> {
  const { clubId, statusFilter } = params;
  const statusList = buildStatusList(statusFilter);

  let query = supabase
    .from('bookings')
    .select(
      `
        id,
        status,
        total_amount,
        created_at,
        player_id,
        group_id,
        booking_batch_id,
        player_users ( full_name ),
        group_users ( group_name ),
        court_slots!inner (
          id,
          date,
          start_time,
          end_time,
          courts!inner (
            id,
            name,
            club_id
          )
        )
      `
    )
    .eq('court_slots.courts.club_id', clubId)
    .is('booking_batch_id', null);

  if (statusFilter === 'all') {
    query = query.in('status', statusList);
  } else {
    query = query.in('status', statusList);
  }

  query = query.order('created_at', { ascending: false });

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message || 'Failed to load booking requests');
  }

  const rows = (data ?? []) as BookingRow[];

  return rows
    .filter((row) => row.court_slots?.courts?.club_id === clubId)
    .map<BookingRequestItem>((row) => {
      const slot = row.court_slots;
      return {
        kind: row.group_id ? 'group' : 'single',
        requestId: row.id,
        bookingId: row.id,
        status: (row.status ?? 'pending').toLowerCase(),
        totalAmount: Number(row.total_amount ?? 0),
        playerName: row.player_users?.full_name ?? null,
        groupName: row.group_users?.group_name ?? null,
        createdAt: row.created_at ?? null,
        slot: {
          slotId: slot?.id ?? null,
          slotDate: slot?.date ?? '',
          startTime: slot?.start_time ?? '',
          endTime: slot?.end_time ?? '',
          courtName: slot?.courts?.name ?? null,
          price: null,
        },
      };
    });
}

async function fetchBatchRequests(params: {
  clubId: string;
  statusFilter: StatusFilter;
}): Promise<BatchRequestItem[]> {
  const { clubId, statusFilter } = params;
  const statusList = buildStatusList(statusFilter);

  let query = supabase
    .from('booking_batch_items')
    .select(
      `
        id,
        status,
        price,
        slot_id,
        court_slots!inner (
          id,
          date,
          start_time,
          end_time,
          courts!inner (
            id,
            name,
            club_id
          )
        ),
        booking_batches!inner (
          id,
          status,
          total_amount,
          created_at,
          group_id,
          player_id,
          notes,
          group_users ( group_name ),
          player_users ( full_name ),
          club_id
        )
      `
    )
    .eq('booking_batches.club_id', clubId);

  if (statusFilter === 'all') {
    query = query.in('booking_batches.status', statusList);
  } else {
    query = query.in('booking_batches.status', statusList);
  }

  query = query.order('created_at', {
    ascending: false,
    referencedTable: 'booking_batches',
  });

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message || 'Failed to load group batch requests');
  }

  const rows = (data ?? []) as BatchItemRow[];
  const grouped = new Map<string, BatchRequestItem>();

  for (const row of rows) {
    const batch = row.booking_batches;
    if (!batch) continue;
    if (!statusList.includes((batch.status ?? '').toLowerCase())) continue;

    const existing = grouped.get(batch.id);
    if (!existing) {
      grouped.set(batch.id, {
        kind: 'batch',
        requestId: batch.id,
        batchId: batch.id,
        status: (batch.status ?? 'pending').toLowerCase(),
        totalAmount: Number(batch.total_amount ?? 0),
        playerName: batch.player_users?.full_name ?? null,
        groupName: batch.group_users?.group_name ?? null,
        createdAt: batch.created_at ?? null,
        slots: [],
      });
    }

    const target = grouped.get(batch.id);
    if (!target) continue;

    const slot = row.court_slots;
    target.slots.push({
      slotId: row.slot_id,
      slotDate: slot?.date ?? '',
      startTime: slot?.start_time ?? '',
      endTime: slot?.end_time ?? '',
      courtName: slot?.courts?.name ?? null,
      price: row.price != null ? Number(row.price) : null,
    });
  }

  return Array.from(grouped.values()).sort((a, b) => getSortTimestamp(b) - getSortTimestamp(a));
}

function applyTypeFilter(items: RequestItem[], filter: TypeFilter): RequestItem[] {
  if (filter === 'all') return items;
  return items.filter((item) => item.kind === filter);
}

function countByStatus(items: RequestItem[], status: string): number {
  return items.filter((item) => item.status === status).length;
}

// ===== Component =====
export const ApproveRequests: React.FC = () => {
  const [clubId, setClubId] = useState<string | null>(null);
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [busyId, setBusyId] = useState<string | null>(null);
  const { formatPrice } = useCurrency();

  const loadClubId = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) {
      throw new Error('Not signed in.');
    }

    const { data, error } = await supabase
      .from('club_users')
      .select('id')
      .eq('user_id', uid)
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data?.id) throw new Error('No club profile found for user.');
    return data.id as string;
  }, []);

  const loadRequests = useCallback(async () => {
    if (!clubId) return [] as RequestItem[];

    const [bookingRequests, batchRequests] = await Promise.all([
      fetchBookingRequests({ clubId, statusFilter }),
      fetchBatchRequests({ clubId, statusFilter }),
    ]);

    const combined = [...bookingRequests, ...batchRequests];
    combined.sort((a, b) => getSortTimestamp(b) - getSortTimestamp(a));
    return combined;
  }, [clubId, statusFilter]);

  const refresh = useCallback(async () => {
    if (!clubId) return;
    setLoading(true);
    setErr(null);
    try {
      const next = await loadRequests();
      setRequests(next);
    } catch (error: any) {
      console.error('Failed to load requests:', error);
      setErr(error?.message ?? 'Failed to load requests');
    } finally {
      setLoading(false);
    }
  }, [clubId, loadRequests]);

  useEffect(() => {
    (async () => {
      try {
        const id = await loadClubId();
        setClubId(id);
      } catch (error: any) {
        setErr(error?.message ?? 'Unable to determine club context');
      }
    })();
  }, [loadClubId]);

  useEffect(() => {
    if (!clubId) return;
    void refresh();
  }, [clubId, statusFilter, refresh]);

  const filteredRequests = useMemo(
    () => applyTypeFilter(requests, typeFilter),
    [requests, typeFilter]
  );

  const totals = useMemo(() => ({
    pending: countByStatus(requests, 'pending'),
    approved: countByStatus(requests, 'approved'),
    rejected: countByStatus(requests, 'rejected'),
  }), [requests]);

  async function approveBooking(bookingId: string) {
    setBusyId(bookingId);
    const { error } = await supabase
      .from('bookings')
      .update({ status: 'approved' })
      .eq('id', bookingId);
    setBusyId(null);
    if (error) {
      setErr(error.message);
      return;
    }
    await refresh();
  }

  async function rejectBooking(bookingId: string) {
    setBusyId(bookingId);
    const { error } = await supabase
      .from('bookings')
      .update({ status: 'rejected' })
      .eq('id', bookingId);
    setBusyId(null);
    if (error) {
      setErr(error.message);
      return;
    }
    await refresh();
  }

  async function approveBatch(batchId: string) {
    setBusyId(batchId);
    const { error } = await supabase.rpc('approve_booking_batch', {
      p_batch_id: batchId,
    });
    setBusyId(null);
    if (error) {
      setErr(error.message);
      return;
    }
    await refresh();
  }

  async function rejectBatch(batchId: string) {
    setBusyId(batchId);
    const { error } = await supabase.rpc('reject_booking_batch', {
      p_batch_id: batchId,
    });
    setBusyId(null);
    if (error) {
      setErr(error.message);
      return;
    }
    await refresh();
  }

  const renderStatusBadge = (status: string) => {
    const key = status?.toLowerCase?.() ?? 'default';
    const className = statusClasses[key] ?? statusClasses.default;
    const label = status ? status.replace(/_/g, ' ') : '—';
    return (
      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}>
        {label}
      </span>
    );
  };

  const renderActions = (request: RequestItem) => {
    if (request.status !== 'pending') {
      return <span className="text-sm text-gray-400">No actions</span>;
    }

    if (request.kind === 'batch') {
      const isBusy = busyId === request.batchId;
      return (
        <div className="flex flex-wrap gap-2">
          <button
            className="rounded-md bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isBusy}
            onClick={() => void approveBatch(request.batchId)}
          >
            {isBusy ? 'Processing…' : 'Approve'}
          </button>
          <button
            className="rounded-md bg-rose-500 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isBusy}
            onClick={() => void rejectBatch(request.batchId)}
          >
            {isBusy ? 'Processing…' : 'Reject'}
          </button>
        </div>
      );
    }

    const isBusy = busyId === request.bookingId;
    return (
      <div className="flex flex-wrap gap-2">
        <button
          className="rounded-md bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isBusy}
          onClick={() => void approveBooking(request.bookingId)}
        >
          {isBusy ? 'Processing…' : 'Approve'}
        </button>
        <button
          className="rounded-md bg-rose-500 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isBusy}
          onClick={() => void rejectBooking(request.bookingId)}
        >
          {isBusy ? 'Processing…' : 'Reject'}
        </button>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Approve Requests</h1>
          <p className="text-sm text-gray-500">
            Review pending booking requests, filter by request type, and approve or reject them in one place.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-indigo-500 focus:outline-none"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
          >
            {STATUS_FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-indigo-500 focus:outline-none"
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value as TypeFilter)}
          >
            {TYPE_FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            onClick={() => void refresh()}
            disabled={loading}
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-sm text-gray-500">
        <span>
          Total: <span className="font-medium text-gray-900">{requests.length}</span>
        </span>
        <span>
          Pending: <span className="font-medium text-gray-900">{totals.pending}</span>
        </span>
        <span>
          Approved: <span className="font-medium text-gray-900">{totals.approved}</span>
        </span>
        <span>
          Rejected: <span className="font-medium text-gray-900">{totals.rejected}</span>
        </span>
      </div>

      {err && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}

      {loading ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="animate-pulse space-y-3">
            <div className="h-4 w-1/3 rounded bg-gray-200" />
            <div className="h-4 w-1/2 rounded bg-gray-200" />
            <div className="h-4 w-2/5 rounded bg-gray-200" />
            <div className="h-4 w-2/3 rounded bg-gray-200" />
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Request
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Player / Group
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Dates selected
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Total amount
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {filteredRequests.map((request) => (
                  <tr key={request.requestId} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-4 py-4 align-top text-sm text-gray-900">
                      <div className="font-medium text-gray-900">{requestTypeLabels[request.kind]}</div>
                      {request.kind === 'batch' ? (
                        <div className="text-xs text-gray-500">{request.slots.length} slot(s)</div>
                      ) : (
                        <div className="text-xs text-gray-500">{request.slot.courtName ?? 'Court'} </div>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 align-top text-sm text-gray-700">
                      <div className="font-medium text-gray-900">
                        {request.groupName || request.playerName || '—'}
                      </div>
                      {request.kind === 'group' && request.playerName && (
                        <div className="text-xs text-gray-500">Requested by {request.playerName}</div>
                      )}
                    </td>
                    <td className="px-4 py-4 align-top text-sm text-gray-700">
                      {request.kind === 'batch' ? (
                        <ul className="space-y-1">
                          {request.slots.map((slot, index) => (
                            <li key={`${request.requestId}-${slot.slotId ?? index}`}>
                              <div>{formatSlotRange(slot)}</div>
                              {slot.courtName && (
                                <div className="text-xs text-gray-500">{slot.courtName}</div>
                              )}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div>
                          <div>{formatSlotRange(request.slot)}</div>
                          {request.slot.courtName && (
                            <div className="text-xs text-gray-500">{request.slot.courtName}</div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 align-top text-sm text-gray-900">
                      {request.totalAmount ? formatPrice(request.totalAmount) : '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 align-top text-sm text-gray-700">
                      {renderStatusBadge(request.status)}
                    </td>
                    <td className="px-4 py-4 align-top text-sm text-gray-700">
                      {renderActions(request)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!filteredRequests.length && !loading && (
            <div className="border-t border-gray-200 px-6 py-8 text-center text-sm text-gray-500">
              {requests.length
                ? 'No requests match the selected filters.'
                : 'No booking requests found for your club yet.'}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Export both named and default to satisfy any import style
export default ApproveRequests;
