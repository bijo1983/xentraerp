import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Calendar, Clock, User, DollarSign, CheckCircle, XCircle, AlertCircle, MapPin, Eye } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { useCurrency } from '../../hooks/useCurrency';
import { format } from 'date-fns';

interface BookingRequest {
  booking_id: string;
  booking_status: string;
  payment_status: string;
  total_amount: number;
  booking_created_at: string;
  player_id: string;
  player_name: string;
  player_email: string;
  player_phone: string;
  slot_id: string;
  slot_date: string;
  slot_start_time: string;
  slot_end_time: string;
  court_id: string;
  court_name: string;
  club_id: string;
  club_name: string;
}

interface GroupBatchSlot {
  booking_id: string;
  slot_id: string;
  slot_date: string | null;
  slot_start_time: string | null;
  slot_end_time: string | null;
  court_id: string | null;
  court_name: string | null;
  slot_price: number | null;
}

interface GroupBatchRequest {
  batch_id: string;
  status: string;
  booking_month: string;
  total_amount: number;
  booking_count: number;
  notes: string | null;
  group_id: string | null;
  group_name: string | null;
  club_id: string;
  created_at: string;
  slots: GroupBatchSlot[];
}

const sortSlots = (slots: GroupBatchSlot[]): GroupBatchSlot[] => {
  return [...slots].sort((a, b) => {
    if (a.slot_date && b.slot_date) {
      const diff = new Date(a.slot_date).getTime() - new Date(b.slot_date).getTime();
      if (diff !== 0) return diff;
    } else if (a.slot_date) {
      return -1;
    } else if (b.slot_date) {
      return 1;
    }

    const startA = a.slot_start_time ?? '';
    const startB = b.slot_start_time ?? '';
    if (startA < startB) return -1;
    if (startA > startB) return 1;
    return 0;
  });
};

export const ApproveRequests: React.FC = () => {
  const { userProfile } = useAuthStore();
  const { formatPrice } = useCurrency();

  const [viewMode, setViewMode] = useState<'individual' | 'group'>('individual');

  // Individual
  const [pendingRequests, setPendingRequests] = useState<BookingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Group
  const [pendingBatches, setPendingBatches] = useState<GroupBatchRequest[]>([]);
  const [groupLoading, setGroupLoading] = useState(false);
  const [processingBatchId, setProcessingBatchId] = useState<string | null>(null);

  // View batch modal (rich version)
  const [viewingBatch, setViewingBatch] = useState<GroupBatchRequest | null>(null);
  const [viewingBatchSlots, setViewingBatchSlots] = useState<GroupBatchSlot[]>([]);
  const [viewingBatchLoading, setViewingBatchLoading] = useState(false);
  const [viewingBatchError, setViewingBatchError] = useState<string | null>(null);
  const latestBatchRequestRef = useRef<string | null>(null);

  const closeBatchDetails = () => {
    latestBatchRequestRef.current = null;
    setViewingBatch(null);
    setViewingBatchSlots([]);
    setViewingBatchError(null);
    setViewingBatchLoading(false);
  };

  const sortedViewingSlots = useMemo(() => sortSlots(viewingBatchSlots), [viewingBatchSlots]);

  useEffect(() => {
    if (!viewingBatch) return;
    const stillPending = pendingBatches.some((batch) => batch.batch_id === viewingBatch.batch_id);
    if (!stillPending) closeBatchDetails();
  }, [pendingBatches, viewingBatch]);

  const mapBookingRowsToSlots = (rows: any[] | null | undefined): GroupBatchSlot[] => {
    if (!Array.isArray(rows)) return [];
    return rows.map((booking) => ({
      booking_id: booking.id ?? booking.booking_id ?? booking.slot_id ?? '',
      slot_id: booking.slot_id ?? '',
      slot_date: booking.court_slots?.date ?? null,
      slot_start_time: booking.court_slots?.start_time ?? null,
      slot_end_time: booking.court_slots?.end_time ?? null,
      court_id: booking.court_slots?.court_id ?? null,
      court_name: booking.court_slots?.courts?.name ?? null,
      slot_price:
        booking.total_amount !== undefined && booking.total_amount !== null
          ? Number(booking.total_amount)
          : booking.price !== undefined && booking.price !== null
            ? Number(booking.price)
            : null,
    }));
  };

  const mergeSlotSources = (
    primary: GroupBatchSlot[] = [],
    secondary: GroupBatchSlot[] = []
  ): GroupBatchSlot[] => {
    const byKey = new Map<string, GroupBatchSlot>();
    const addSlots = (slots: GroupBatchSlot[]) => {
      slots.forEach((slot) => {
        const key = `${slot.slot_id}:${slot.slot_date ?? ''}:${slot.slot_start_time ?? ''}:${slot.slot_end_time ?? ''}`;
        byKey.set(key, slot);
      });
    };
    addSlots(primary);
    addSlots(secondary);
    return Array.from(byKey.values());
  };

  const loadBatchSlots = async (batchIds: string | string[]) => {
    const ids = (Array.isArray(batchIds) ? batchIds : [batchIds]).filter(Boolean);
    if (ids.length === 0) return {} as Record<string, GroupBatchSlot[]>;

    const [bookingsResponse, batchItemsResponse] = await Promise.all([
      supabase
        .from('bookings')
        .select(
          `id, booking_batch_id, total_amount, slot_id, court_slots (
            date,
            start_time,
            end_time,
            court_id,
            courts ( id, name )
          )`
        )
        .in('booking_batch_id', ids),
      supabase
        .from('booking_batch_items')
        .select(
          `id, batch_id, slot_id, price, status, court_slots (
            date,
            start_time,
            end_time,
            court_id,
            courts ( id, name )
          )`
        )
        .in('batch_id', ids),
    ]);

    const result: Record<string, GroupBatchSlot[]> = {};

    if (bookingsResponse.error) console.error('Error fetching batch bookings:', bookingsResponse.error);
    if (batchItemsResponse.error) console.error('Error fetching booking batch items:', batchItemsResponse.error);

    if (Array.isArray(bookingsResponse.data)) {
      bookingsResponse.data.forEach((row: any) => {
        if (!row.booking_batch_id) return;
        const existing = result[row.booking_batch_id] ?? [];
        const mapped = mapBookingRowsToSlots([row]);
        result[row.booking_batch_id] = mergeSlotSources(existing, mapped);
      });
    }

    if (Array.isArray(batchItemsResponse.data)) {
      batchItemsResponse.data.forEach((row: any) => {
        if (!row.batch_id) return;
        const existing = result[row.batch_id] ?? [];
        const mapped = mapBookingRowsToSlots([
          {
            id: row.id,
            booking_id: row.id,
            slot_id: row.slot_id,
            court_slots: row.court_slots,
            price: row.price,
            total_amount: row.price,
          },
        ]);
        result[row.batch_id] = mergeSlotSources(existing, mapped);
      });
    }

    Object.keys(result).forEach((key) => {
      result[key] = sortSlots(result[key]);
    });

    return result;
  };

  const openBatchDetails = (batch: GroupBatchRequest) => {
    setViewingBatch(batch);
    const preloaded = sortSlots(batch.slots ?? []);
    setViewingBatchSlots(preloaded);
    setViewingBatchError(null);
    const requestId = batch.batch_id;
    latestBatchRequestRef.current = requestId;
    setViewingBatchLoading(preloaded.length === 0);

    const loadSlots = async () => {
      try {
        const slotResults = await loadBatchSlots(requestId);
        if (latestBatchRequestRef.current !== requestId) return;

        const sorted = slotResults[requestId] ?? [];
        setViewingBatchSlots(sorted);
        setViewingBatchError(null);

        setPendingBatches((prev) =>
          prev.map((existing) =>
            existing.batch_id === requestId ? { ...existing, slots: sorted } : existing
          )
        );
        setViewingBatch((prev) =>
          prev && prev.batch_id === requestId ? { ...prev, slots: sorted } : prev
        );
      } catch (error) {
        console.error('Error loading batch slots:', error);
        if (latestBatchRequestRef.current === requestId) {
          setViewingBatchError('Unable to load slot details. Please try again.');
          if (preloaded.length === 0) setViewingBatchSlots([]);
        }
      } finally {
        if (latestBatchRequestRef.current === requestId) {
          setViewingBatchLoading(false);
        }
      }
    };

    void loadSlots();
  };

  useEffect(() => {
    if (!userProfile) return;
    if (viewMode === 'group') {
      void fetchPendingBatches();
    } else {
      void fetchPendingRequests();
    }
  }, [userProfile, viewMode]);

  useEffect(() => {
    if (viewMode !== 'group') closeBatchDetails();
  }, [viewMode]);

  const fetchPendingBatches = async () => {
    if (!userProfile) return;

    setGroupLoading(true);
    try {
      const { data: clubRows, error: clubErr } = await supabase
        .from('club_users')
        .select('id')
        .eq('user_id', (userProfile as any).user_id || (userProfile as any).id)
        .limit(1)
        .maybeSingle();

      if (clubErr) throw clubErr;
      if (!clubRows) {
        setPendingBatches([]);
        return [];
      }

      const clubId = clubRows.id;
      const { data, error } = await supabase
        .from('booking_batches')
        .select(`
          id,
          status,
          booking_month,
          total_amount,
          booking_count,
          notes,
          group_id,
          club_id,
          created_at,
          group_users!left( group_name )
        `)
        .eq('club_id', clubId)
        .eq('status', 'pending')
        .order('created_at', { ascending: true });

      if (error) throw error;

      const batchIds = Array.isArray(data) ? data.map((row) => row.id).filter(Boolean) : [];
      const slotsByBatch = await loadBatchSlots(batchIds);

      const mapped: GroupBatchRequest[] = (data || []).map((row: any) => {
        const relation = row.group_users;
        const derivedGroupName = Array.isArray(relation)
          ? relation[0]?.group_name ?? null
          : relation?.group_name ?? null;

        const sortedSlots = slotsByBatch[row.id] ?? [];

        return {
          batch_id: row.id,
          status: row.status,
          booking_month: row.booking_month,
          total_amount: Number(row.total_amount) || 0,
          booking_count: Number(row.booking_count) || 0,
          notes: row.notes ?? null,
          group_id: row.group_id ?? null,
          group_name: derivedGroupName,
          club_id: row.club_id,
          created_at: row.created_at,
          slots: sortedSlots,
        };
      });

      setPendingBatches(mapped);
      setViewingBatch((current) => {
        if (!current) return current;
        const updated = mapped.find((b) => b.batch_id === current.batch_id);
        if (updated) {
          setViewingBatchSlots(sortSlots(updated.slots ?? []));
          return updated;
        }
        return current;
      });

      return mapped;
    } catch (e) {
      console.error('Error fetching pending group batches:', e);
      setPendingBatches([]);
    } finally {
      setGroupLoading(false);
    }
  };

  const fetchPendingRequests = async ({ skipLoading = false }: { skipLoading?: boolean } = {}): Promise<BookingRequest[]> => {
    if (!userProfile) return [];
    if (!skipLoading) setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_club_pending_bookings');
      if (error) throw error;
      const sanitized = (data || []) as BookingRequest[];
      setPendingRequests(sanitized);
      return sanitized;
    } catch (error) {
      console.error('Error fetching pending requests:', error);
      setPendingRequests([]);
      return [];
    } finally {
      if (!skipLoading) setLoading(false);
    }
  };

  const approveBooking = async (booking: BookingRequest) => {
    if (!confirm(`Approve booking for ${booking.player_name}?`)) return;
    setProcessingId(booking.booking_id);
    try {
      const { data, error } = await supabase.rpc('approve_booking', { p_booking_id: booking.booking_id });
      if (error) throw error;
      if (data && !data.success) throw new Error(data.error || 'Failed to approve booking');
      alert('Booking approved successfully!');
      await fetchPendingRequests();
    } catch (error) {
      console.error('Error approving booking:', error);
      alert('Error approving booking. Please try again.');
    } finally {
      setProcessingId(null);
    }
  };

  const rejectBooking = async (booking: BookingRequest) => {
    if (!confirm(`Reject booking for ${booking.player_name}?`)) return;
    setProcessingId(booking.booking_id);
    try {
      const { data, error } = await supabase.rpc('reject_booking', { p_booking_id: booking.booking_id });
      if (error) throw error;
      if (data && !data.success) throw new Error(data.error || 'Failed to reject booking');
      alert('Booking rejected successfully!');
      await fetchPendingRequests();
    } catch (error) {
      console.error('Error rejecting booking:', error);
      alert('Error rejecting booking. Please try again.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleBatchDecision = async (batch: GroupBatchRequest, action: 'approve' | 'reject') => {
    const isApprove = action === 'approve';
    const confirmationMessage = isApprove
      ? `Approve group batch${batch.group_name ? ' for ' + batch.group_name : ''}?`
      : `Reject group batch${batch.group_name ? ' for ' + batch.group_name : ''}?`;

    if (!confirm(confirmationMessage)) return;

    setProcessingBatchId(batch.batch_id);
    try {
      const rpcName = isApprove ? 'approve_booking_batch' : 'reject_booking_batch';
      const { data, error } = await supabase.rpc(rpcName, { p_batch_id: batch.batch_id });
      if (error) throw error;
      if (data && data.success === false) {
        throw new Error(data.message || (isApprove ? 'Batch approval failed' : 'Batch rejection failed'));
      }
      alert(isApprove ? 'Group batch approved successfully!' : 'Group batch rejected.');
      await fetchPendingBatches();
      await fetchPendingRequests({ skipLoading: true });
    } catch (err) {
      console.error(`Error ${isApprove ? 'approving' : 'rejecting'} batch:`, err);
      alert(
        isApprove
          ? 'Error approving batch. Please check policies/RPC and try again.'
          : 'Error rejecting batch. Please check policies/RPC and try again.'
      );
    } finally {
      setProcessingBatchId(null);
    }
  };

  const approveBatch = (batch: GroupBatchRequest) => handleBatchDecision(batch, 'approve');
  const rejectBatch = (batch: GroupBatchRequest) => handleBatchDecision(batch, 'reject');

  const isGroupView = viewMode === 'group';
  const currentLoading = isGroupView ? groupLoading : loading;
  const pendingCount = isGroupView ? pendingBatches.length : pendingRequests.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-text-primary">Approve Booking Requests</h1>

          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => setViewMode('individual')}
              className={`px-4 py-2 rounded-lg border font-semibold transition-colors ${
                viewMode === 'individual'
                  ? 'bg-primary-500 border-primary-500 text-white shadow-sm'
                  : 'bg-white border-primary-200 text-primary-600 hover:bg-primary-50'
              }`}
            >
              Individual
            </button>
            <button
              type="button"
              onClick={() => setViewMode('group')}
              className={`px-4 py-2 rounded-lg border font-semibold transition-colors ${
                viewMode === 'group'
                  ? 'bg-secondary-500 border-secondary-500 text-white shadow-sm'
                  : 'bg-white border-secondary-200 text-secondary-600 hover:bg-secondary-50'
              }`}
            >
              Groups
            </button>
          </div>
          <p className="text-text-secondary mt-1">Review and approve pending court bookings</p>
        </div>
        {pendingCount > 0 && (
          <div className="flex items-center gap-2 bg-accent-50 border border-accent-200 rounded-lg px-4 py-2">
            <AlertCircle className="h-5 w-5 text-accent-500" />
            <span className="font-semibold text-accent-700">
              {pendingCount} Pending {isGroupView ? (pendingCount === 1 ? 'Group Batch' : 'Group Batches') : pendingCount === 1 ? 'Request' : 'Requests'}
            </span>
          </div>
        )}
      </div>

      {viewingBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8">
          <div className="absolute inset-0 bg-black bg-opacity-50" onClick={closeBatchDetails} role="presentation" />
          <div className="relative z-10 w-full max-w-3xl rounded-xl bg-white shadow-xl">
            <div className="flex items-start justify-between border-b border-gray-200 px-6 py-4">
              <div>
                <h3 className="text-xl font-semibold text-text-primary">
                  {viewingBatch.group_name || 'Group'} –{' '}
                  {viewingBatch.booking_month
                    ? format(new Date(viewingBatch.booking_month), 'MMMM yyyy')
                    : 'Requested schedule'}
                </h3>
                <p className="text-sm text-text-secondary">
                  {viewingBatch.booking_count ?? 0} slots · Total {formatPrice(viewingBatch.total_amount || 0)}
                </p>
                {viewingBatch.notes && (
                  <p className="mt-1 text-sm text-text-secondary">Notes: {viewingBatch.notes}</p>
                )}
              </div>
              <button
                type="button"
                onClick={closeBatchDetails}
                className="rounded-full border border-gray-300 px-3 py-1 text-sm text-text-secondary hover:bg-gray-100"
              >
                Close
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto px-6 py-4">
              {viewingBatchLoading && sortedViewingSlots.length === 0 ? (
                <div className="py-12 text-center text-sm text-text-secondary">Loading slot details…</div>
              ) : sortedViewingSlots.length > 0 ? (
                <>
                  {viewingBatchError && (
                    <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {viewingBatchError}
                    </div>
                  )}
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left font-medium text-text-secondary">Date</th>
                          <th className="px-4 py-2 text-left font-medium text-text-secondary">Time</th>
                          <th className="px-4 py-2 text-left font-medium text-text-secondary">Court</th>
                          <th className="px-4 py-2 text-right font-medium text-text-secondary">Price</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {sortedViewingSlots.map((slot) => {
                          const key = `${slot.booking_id}-${slot.slot_id}`;
                          const dateLabel = slot.slot_date ? format(new Date(slot.slot_date), 'EEE, dd MMM') : 'Date TBD';
                          const timeLabel = `${slot.slot_start_time ?? '—'} – ${slot.slot_end_time ?? '—'}`;
                          const courtLabel = slot.court_name ?? slot.court_id ?? 'Court';
                          const priceLabel = slot.slot_price !== null ? formatPrice(slot.slot_price) : '—';
                          return (
                            <tr key={key}>
                              <td className="px-4 py-3 text-text-primary font-medium">{dateLabel}</td>
                              <td className="px-4 py-3 text-text-secondary">{timeLabel}</td>
                              <td className="px-4 py-3 text-text-secondary">{courtLabel}</td>
                              <td className="px-4 py-3 text-right text-text-primary font-semibold">{priceLabel}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : viewingBatchError ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-6 text-center text-sm text-red-700">
                  {viewingBatchError}
                </div>
              ) : (
                <div className="rounded-lg border border-background-subtle bg-background-subtle px-4 py-6 text-center text-sm text-text-secondary">
                  Slot details are not available for this batch.
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-gray-200 bg-background px-6 py-4">
              <button
                type="button"
                onClick={closeBatchDetails}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-text-secondary hover:bg-gray-100"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {currentLoading ? (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
        </div>
      ) : isGroupView ? (
        <div className="grid gap-6">
          {pendingBatches.length === 0 ? (
            <div className="bg-background rounded-xl shadow-sm border border-background-subtle p-12 text-center">
              <AlertCircle className="h-12 w-12 text-text-secondary mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-text-primary mb-2">No pending group batches</h3>
              <p className="text-text-secondary">You're all set.</p>
            </div>
          ) : (
            pendingBatches.map((batch) => {
              return (
                <div
                  key={batch.batch_id}
                  className="bg-background rounded-xl shadow-sm border border-background-subtle overflow-hidden hover:shadow-md transition-shadow"
                >
                  <div className="p-6">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="flex items-center gap-3 mb-2">
                          <User className="h-5 w-5 text-text-secondary" />
                          <h3 className="text-lg font-semibold text-text-primary">
                            {batch.group_name || 'Group'} • {new Date(batch.created_at).toLocaleDateString()}
                          </h3>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm text-text-secondary">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4" /> Month:{' '}
                            {new Date(batch.booking_month).toLocaleDateString(undefined, {
                              year: 'numeric',
                              month: 'long',
                            })}
                          </div>
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4" /> Slots: {batch.booking_count ?? 0}
                          </div>
                          <div className="flex items-center gap-2">
                            <DollarSign className="h-4 w-4" /> Total: {formatPrice(batch.total_amount || 0)}
                          </div>
                        </div>
                        {batch.notes && (
                          <p className="text-sm text-text-secondary mt-2">Notes: {batch.notes}</p>
                        )}
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                        <button
                          type="button"
                          onClick={() => openBatchDetails(batch)}
                          className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-secondary-200 text-secondary-600 hover:bg-secondary-50 transition-colors"
                        >
                          <Eye className="h-4 w-4" /> View slots
                        </button>
                        <button
                          onClick={() => rejectBatch(batch)}
                          disabled={processingBatchId === batch.batch_id}
                          className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-transparent bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <XCircle className="h-4 w-4" /> Reject
                        </button>
                        <button
                          onClick={() => approveBatch(batch)}
                          disabled={processingBatchId === batch.batch_id}
                          className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-transparent bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <CheckCircle className="h-4 w-4" /> Approve
                        </button>
                      </div>
                      {batch.notes && <p className="text-sm text-text-secondary mt-2">Notes: {batch.notes}</p>}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : pendingRequests.length === 0 ? (
        <div className="bg-background rounded-xl shadow-sm border border-background-subtle p-12 text-center">
          <CheckCircle className="h-12 w-12 text-primary-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-text-primary mb-2">All caught up!</h3>
          <p className="text-text-secondary">No pending booking requests at the moment.</p>
        </div>
      ) : (
        <div className="grid gap-6">
          {pendingRequests.map((booking) => (
            <div
              key={booking.booking_id}
              className="bg-background rounded-xl shadow-sm border border-background-subtle overflow-hidden hover:shadow-md transition-shadow"
            >
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <User className="h-5 w-5 text-primary-500" />
                      <div>
                        <h3 className="text-lg font-semibold text-text-primary">
                          {booking.player_name}
                        </h3>
                        <p className="text-sm text-text-secondary">{booking.player_email}</p>
                        {booking.player_phone && (
                          <p className="text-sm text-text-secondary">{booking.player_phone}</p>
                        )}
                      </div>
                    </div>
                  </div>
                  <span className="px-3 py-1 text-sm font-medium rounded-full bg-accent-100 text-accent-700">
                    Pending Approval
                  </span>
                </div>

                <div className="bg-background-subtle rounded-lg p-4 mb-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex items-center text-text-primary">
                      <MapPin className="h-5 w-5 text-primary-500 mr-2" />
                      <div>
                        <p className="text-xs text-text-secondary">Court</p>
                        <p className="font-medium">{booking.court_name}</p>
                      </div>
                    </div>

                    <div className="flex items-center text-text-primary">
                      <Calendar className="h-5 w-5 text-primary-500 mr-2" />
                      <div>
                        <p className="text-xs text-text-secondary">Date</p>
                        <p className="font-medium">{booking.slot_date}</p>
                      </div>
                    </div>

                    <div className="flex items-center text-text-primary">
                      <Clock className="h-5 w-5 text-primary-500 mr-2" />
                      <div>
                        <p className="text-xs text-text-secondary">Time</p>
                        <p className="font-medium">
                          {booking.slot_start_time} - {booking.slot_end_time}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center text-text-primary">
                      <DollarSign className="h-5 w-5 text-primary-500 mr-2" />
                      <div>
                        <p className="text-xs text-text-secondary">Amount</p>
                        <p className="font-medium">{formatPrice(booking.total_amount)}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-background-subtle">
                  <p className="text-xs text-text-secondary">
                    Requested on {new Date(booking.booking_created_at).toLocaleDateString()} at{' '}
                    {new Date(booking.booking_created_at).toLocaleTimeString()}
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => rejectBooking(booking)}
                      disabled={processingId === booking.booking_id}
                      className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <XCircle className="h-4 w-4" />
                      Reject
                    </button>
                    <button
                      onClick={() => approveBooking(booking)}
                      disabled={processingId === booking.booking_id}
                      className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <CheckCircle className="h-4 w-4" />
                      Approve
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
