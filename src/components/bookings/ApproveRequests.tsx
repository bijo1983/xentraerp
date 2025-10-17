import React, { useState, useEffect } from 'react';
import { Calendar, Clock, User, DollarSign, CheckCircle, XCircle, AlertCircle, MapPin, Eye } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { useCurrency } from '../../hooks/useCurrency';

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
  booking_id: string | null;
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
export const ApproveRequests: React.FC = () => {
  const { userProfile } = useAuthStore();
  const { formatPrice } = useCurrency();
  const [pendingRequests, setPendingRequests] = useState<BookingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  // View mode: individual bookings vs group batches
  const [viewMode, setViewMode] = useState<'individual' | 'group'>('individual');
  // Group batches
  const [pendingBatches, setPendingBatches] = useState<GroupBatchRequest[]>([]);
  const [groupLoading, setGroupLoading] = useState(false);
  const [processingBatchId, setProcessingBatchId] = useState<string | null>(null);
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);

  const toggleBatchDetails = (batchId: string) => {
    setExpandedBatchId((current) => (current === batchId ? null : batchId));
  };

  useEffect(() => {
    if (!userProfile) return;

    if (viewMode === 'group') {
      void fetchPendingBatches();
    } else {
      void fetchPendingRequests();
    }
  }, [userProfile, viewMode]);

  
  // Fetch group booking batches pending approval for the club
  const fetchPendingBatches = async () => {
    if (!userProfile) return;

    setGroupLoading(true);

    try {
      // Determine current user's club_id via a simple query
      // Assumes authStore provides userProfile for club users
      // Find the club row for this auth user
      const { data: clubRows, error: clubErr } = await supabase
        .from('club_users')
        .select('id')
        .eq('user_id', userProfile.user_id || userProfile.id)
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
          group_users!left(
            group_name
          ),
          bookings (
            id,
            slot_id,
            total_amount,
            court_slots (
              date,
              start_time,
              end_time,
              court_id,
              courts (
                id,
                name
              )
            )
          )
        `)
        .eq('club_id', clubId)
        .eq('status', 'pending')
        .order('created_at', { ascending: true });

      if (error) throw error;

      const batchIds = Array.isArray(data) ? data.map((row) => row.id).filter(Boolean) : [];

      let slotsByBatch: Record<string, GroupBatchSlot[]> = {};

      if (batchIds.length > 0) {
        const { data: bookingRows, error: bookingError } = await supabase
          .from('bookings')
          .select(`
            id,
            booking_batch_id,
            slot_id,
            total_amount,
            court_slots (
              date,
              start_time,
              end_time,
              court_id,
              courts (
                id,
                name
              )
            )
          `)
          .in('booking_batch_id', batchIds);

        if (bookingError) {
          console.error('Error fetching slots for batches:', bookingError);
        } else if (Array.isArray(bookingRows)) {
          slotsByBatch = bookingRows.reduce<Record<string, GroupBatchSlot[]>>((acc, booking: any) => {
            const batchId = booking.booking_batch_id;
            if (!batchId) return acc;

            const slot: GroupBatchSlot = {
              booking_id: booking.id ?? null,
              slot_id: booking.slot_id ?? booking.id ?? '',
              slot_date: booking.court_slots?.date ?? null,
              slot_start_time: booking.court_slots?.start_time ?? null,
              slot_end_time: booking.court_slots?.end_time ?? null,
              court_id: booking.court_slots?.court_id ?? null,
              court_name: booking.court_slots?.courts?.name ?? null,
              slot_price: booking.total_amount != null ? Number(booking.total_amount) : null,
            };

            if (!acc[batchId]) {
              acc[batchId] = [];
            }

            acc[batchId].push(slot);
            return acc;
          }, {});
        }
      }

      const mapped: GroupBatchRequest[] = (data || []).map((row: any) => {
        const relation = row.group_users;
        const derivedGroupName = Array.isArray(relation)
          ? relation[0]?.group_name ?? null
          : relation?.group_name ?? null;

        const directSlotsRaw: GroupBatchSlot[] = Array.isArray(row.bookings)
          ? row.bookings.map((booking: any) => ({
              booking_id: booking.id ?? null,
              slot_id: booking.slot_id ?? booking.id ?? '',
              slot_date: booking.court_slots?.date ?? null,
              slot_start_time: booking.court_slots?.start_time ?? null,
              slot_end_time: booking.court_slots?.end_time ?? null,
              court_id: booking.court_slots?.court_id ?? null,
              court_name: booking.court_slots?.courts?.name ?? null,
              slot_price: booking.total_amount != null ? Number(booking.total_amount) : null,
            }))
          : [];

        const combinedSlots = [...(slotsByBatch[row.id] ?? []), ...directSlotsRaw];
        const mergedSlotsMap = new Map<string, GroupBatchSlot>();
        combinedSlots.forEach((slot, index) => {
          const key = slot.slot_id || slot.booking_id || `fallback-${index}`;
          if (!mergedSlotsMap.has(key)) {
            mergedSlotsMap.set(key, slot);
          }
        });

        const sortedSlots = Array.from(mergedSlotsMap.values()).sort((a, b) => {
          const dateA = a.slot_date ? new Date(a.slot_date).getTime() : 0;
          const dateB = b.slot_date ? new Date(b.slot_date).getTime() : 0;
          if (dateA !== dateB) return dateA - dateB;
          const timeA = a.slot_start_time ?? '';
          const timeB = b.slot_start_time ?? '';
          return timeA.localeCompare(timeB);
        });

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

    if (!skipLoading) {
      setLoading(true);
    }
    try {
      console.log('ApproveRequests - Fetching pending bookings...');
      console.log('ApproveRequests - Current user:', userProfile);

      const { data, error } = await supabase.rpc('get_club_pending_bookings');

      console.log('ApproveRequests - RPC Response:', { data, error });

      if (error) throw error;
      const sanitized = (data || []) as BookingRequest[];
      setPendingRequests(sanitized);
      return sanitized;
    } catch (error) {
      console.error('Error fetching pending requests:', error);
      setPendingRequests([]);
      return [];
    } finally {
      if (!skipLoading) {
        setLoading(false);
      }
    }
  };

  const approveBooking = async (booking: BookingRequest) => {
    if (!confirm(`Approve booking for ${booking.player_name}?`)) return;

    setProcessingId(booking.booking_id);
    try {
      const { data, error } = await supabase.rpc('approve_booking', {
        p_booking_id: booking.booking_id
      });

      if (error) throw error;

      if (data && !data.success) {
        throw new Error(data.error || 'Failed to approve booking');
      }

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
      const { data, error } = await supabase.rpc('reject_booking', {
        p_booking_id: booking.booking_id
      });

      if (error) throw error;

      if (data && !data.success) {
        throw new Error(data.error || 'Failed to reject booking');
      }

      alert('Booking rejected successfully!');
      await fetchPendingRequests();
    } catch (error) {
      console.error('Error rejecting booking:', error);
      alert('Error rejecting booking. Please try again.');
    } finally {
      setProcessingId(null);
    }
  };


  const approveBatch = async (batch: GroupBatchRequest) => {
    if (!confirm(`Approve group batch${batch.group_name ? ' for ' + batch.group_name : ''}?`)) return;
    setProcessingBatchId(batch.batch_id);
    try {
      // Prefer secure RPC if available
      const { data, error } = await supabase.rpc('approve_booking_batch', {
        p_batch_id: batch.batch_id
      });

      if (error) throw error;
      if (data && data.success === false) {
        throw new Error(data.message || 'Batch approval failed');
      }

      alert('Group batch approved successfully!');
      // Refresh both views to keep in sync
      await fetchPendingBatches();
      await fetchPendingRequests({ skipLoading: true });
    } catch (err) {
      console.error('Error approving batch:', err);
      alert('Error approving batch. Please check policies/RPC and try again.');
    } finally {
      setProcessingBatchId(null);
    }
  };

  const rejectBatch = async (batch: GroupBatchRequest) => {
    if (!confirm(`Reject group batch${batch.group_name ? ' for ' + batch.group_name : ''}?`)) return;
    setProcessingBatchId(batch.batch_id);
    try {
      const { data, error } = await supabase.rpc('reject_booking_batch', {
        p_batch_id: batch.batch_id
      });

      if (error) throw error;
      if (data && data.success === false) {
        throw new Error(data.message || 'Batch rejection failed');
      }

      alert('Group batch rejected.');
      await fetchPendingBatches();
      await fetchPendingRequests({ skipLoading: true });
    } catch (err) {
      console.error('Error rejecting batch:', err);
      alert('Error rejecting batch. Please check policies/RPC and try again.');
    } finally {
      setProcessingBatchId(null);
    }
  };
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
              const expanded = expandedBatchId === batch.batch_id;
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
                          onClick={() => toggleBatchDetails(batch.batch_id)}
                          className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
                            expanded
                              ? 'border-secondary-500 text-secondary-600 bg-secondary-50'
                              : 'border-secondary-200 text-secondary-600 hover:bg-secondary-50'
                          }`}
                        >
                          <Eye className="h-4 w-4" /> {expanded ? 'Hide slots' : 'View slots'}
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
                  {expanded && (
                    <div className="mt-6 border-t border-background-subtle pt-4">
                      <h4 className="text-sm font-semibold text-text-primary mb-3">Requested schedule</h4>
                      {batch.slots.length > 0 ? (
                        <div className="space-y-2">
                          {batch.slots.map((slot, index) => {
                            const dateLabel = slot.slot_date
                              ? new Date(slot.slot_date).toLocaleDateString(undefined, {
                                  weekday: 'short',
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric',
                                })
                              : 'Date TBD';
                            const start = slot.slot_start_time ?? '—';
                            const end = slot.slot_end_time ?? '—';
                            const court = slot.court_name ?? 'Court';
                            const priceLabel = slot.slot_price != null ? formatPrice(slot.slot_price) : null;

                            return (
                              <div
                                key={`${slot.slot_id}-${slot.booking_id ?? index}`}
                                className="flex flex-col gap-1 rounded-lg border border-background-subtle bg-background px-4 py-3 text-sm shadow-sm"
                              >
                                <span className="font-medium text-text-primary">{dateLabel}</span>
                                <span className="text-text-secondary">
                                  {start} – {end} • {court}
                                  {priceLabel && (
                                    <span className="font-semibold text-text-primary"> ({priceLabel})</span>
                                  )}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-sm text-text-secondary">Slot details are not available for this batch.</p>
                      )}
                    </div>
                  )}
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
