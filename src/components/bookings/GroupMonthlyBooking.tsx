import React, { useEffect, useMemo, useState } from 'react';
import { addMonths, format, startOfMonth } from 'date-fns';
import { Calendar, CheckCircle, Info, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useCurrency } from '../../hooks/useCurrency';

type MonthlySlot = {
  slot_id: string;
  court_id: string;
  court_name: string;
  slot_date: string; // date
  start_time: string;
  end_time: string;
  effective_price: number; // numeric
};

type SubmissionResult = {
  batchId: string;
  totalAmount: number;
  bookingCount: number;
};

type GroupMonthlyBookingProps = {
  clubId: string;
  groupId: string;
  groupName: string;
  mode: 'group' | 'club';
  disabled?: boolean;
  onSubmitted?: (result: SubmissionResult) => void;
  noClubMessage?: string;
};

export const GroupMonthlyBooking: React.FC<GroupMonthlyBookingProps> = ({
  clubId,
  groupId,
  groupName,
  mode,
  disabled = false,
  onSubmitted,
  noClubMessage,
}) => {
  const { formatPrice } = useCurrency();

  const [selectedMonth, setSelectedMonth] = useState<Date>(() => startOfMonth(new Date()));
  const [slots, setSlots] = useState<MonthlySlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlotIds, setSelectedSlotIds] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const plannerDisabled = disabled || !clubId || !groupId;
  const disabledReason = !clubId
    ? noClubMessage || 'Connect your group to a club to unlock monthly planning.'
    : disabled
    ? 'Monthly planning is currently disabled.'
    : null;

  // Load available slots for the selected month
  useEffect(() => {
    if (plannerDisabled) {
      setSlots([]);
      setSelectedSlotIds([]);
      return;
    }

    let live = true;

    const load = async () => {
      setLoadingSlots(true);
      setFeedback(null);

      try {
        const monthIso = format(startOfMonth(selectedMonth), 'yyyy-MM-dd');
        const { data, error } = await supabase.rpc('get_club_monthly_available_slots', {
          p_club_id: clubId,
          p_month: monthIso,
        });

        if (!live) return;

        if (error) {
          console.error('[GroupMonthlyBooking] loadSlots error', error);
          setSlots([]);
          setFeedback({ type: 'error', message: 'Unable to load slots for the selected month.' });
          return;
        }

        setSlots((data ?? []) as MonthlySlot[]);
        // Keep only still-existing selections
        setSelectedSlotIds((prev) => prev.filter((id) => (data ?? []).some((s: MonthlySlot) => s.slot_id === id)));
      } catch (err) {
        if (!live) return;
        console.error('[GroupMonthlyBooking] loadSlots exception', err);
        setSlots([]);
        setFeedback({ type: 'error', message: 'Something went wrong while loading slots.' });
      } finally {
        if (live) setLoadingSlots(false);
      }
    };

    void load();
    return () => {
      live = false;
    };
  }, [clubId, groupId, selectedMonth, plannerDisabled]);

  const selectedSlots = useMemo(
    () => slots.filter((slot) => selectedSlotIds.includes(slot.slot_id)),
    [slots, selectedSlotIds]
  );

  const totalAmount = useMemo(
    () => selectedSlots.reduce((sum, slot) => sum + (Number(slot.effective_price) || 0), 0),
    [selectedSlots]
  );

  const bookingCount = selectedSlotIds.length;

  const toggleSlot = (slotId: string) => {
    if (plannerDisabled) return;
    setSelectedSlotIds((prev) => (prev.includes(slotId) ? prev.filter((id) => id !== slotId) : [...prev, slotId]));
  };

  const shiftMonth = (dir: 'prev' | 'next') => {
    setSelectedMonth((cur) => (dir === 'prev' ? addMonths(cur, -1) : addMonths(cur, 1)));
    setSelectedSlotIds([]);
  };

  const handleSubmit = async () => {
    if (plannerDisabled) return;

    if (!bookingCount) {
      setFeedback({ type: 'error', message: 'Please choose at least one slot to continue.' });
      return;
    }

    setSubmitting(true);
    setFeedback(null);

    try {
      // IMPORTANT: match the function signature PostgREST knows (from your logs)
      const { data, error } = await supabase.rpc('create_group_booking_batch', {
        p_booking_month: format(startOfMonth(selectedMonth), 'yyyy-MM-dd'), // date
        p_club_id: clubId,                                                 // uuid
        p_group_id: groupId,                                               // uuid
        p_notes: notes || null,                                            // text
        p_slot_ids: selectedSlotIds,                                       // uuid[]
      });

      if (error) {
        console.error('[GroupMonthlyBooking] create_group_booking_batch error', error);
        throw error;
      }

      const row = Array.isArray(data) && data.length > 0 ? (data as any[])[0] : null;
      if (!row) throw new Error('Unexpected empty response from booking service');

      const payload: SubmissionResult = {
        batchId: row.batch_id,
        totalAmount: Number(row.total_amount) || totalAmount,
        bookingCount: Number(row.booking_count) || bookingCount,
      };

      setFeedback({
        type: 'success',
        message: `${payload.bookingCount} slots submitted successfully for ${groupName}.`,
      });
      setSelectedSlotIds([]);
      setNotes('');
      onSubmitted?.(payload);

      // Refresh available slots
      const { data: refreshed, error: refreshError } = await supabase.rpc('get_club_monthly_available_slots', {
        p_club_id: clubId,
        p_month: format(startOfMonth(selectedMonth), 'yyyy-MM-dd'),
      });
      if (refreshError) {
        console.error('[GroupMonthlyBooking] refresh slots error', refreshError);
      } else {
        setSlots((refreshed ?? []) as MonthlySlot[]);
      }
    } catch (err: any) {
      console.error('[GroupMonthlyBooking] handleSubmit exception', err);
      const message = err?.message || 'Unable to submit group booking. Please try again.';
      setFeedback({ type: 'error', message });
    } finally {
      setSubmitting(false);
    }
  };

  const notesPlaceholder =
    mode === 'group'
      ? 'Share any special instructions for the club (optional)'
      : 'Add notes for this group submission (optional)';

  if (!groupId) {
    return (
      <div className="p-6 bg-white border border-gray-200 rounded-xl text-center text-sm text-gray-600">
        Select a valid group to view available slots.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Monthly slot planner</h2>
          <p className="text-sm text-gray-600">
            {mode === 'group' ? 'Your group' : 'Club-managed'} bookings for{' '}
            <span className="font-medium text-gray-900">{groupName}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => shiftMonth('prev')}
            className="px-3 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={loadingSlots || submitting || plannerDisabled}
          >
            <RefreshCw className="h-4 w-4 mr-1 inline-block rotate-180" /> Prev
          </button>
          <div className="px-4 py-2 bg-gray-100 rounded-lg font-medium text-gray-800">
            <Calendar className="h-4 w-4 inline-block mr-1 text-green-600" />
            {format(selectedMonth, 'MMMM yyyy')}
          </div>
          <button
            type="button"
            onClick={() => shiftMonth('next')}
            className="px-3 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={loadingSlots || submitting || plannerDisabled}
          >
            Next <RefreshCw className="h-4 w-4 ml-1 inline-block" />
          </button>
        </div>
      </div>

      {disabledReason && (
        <div className="flex items-start gap-2 px-4 py-3 rounded-lg border border-blue-200 bg-blue-50 text-sm text-blue-700">
          <Info className="h-4 w-4 text-blue-500" />
          <span>{disabledReason}</span>
        </div>
      )}

      {feedback && (
        <div
          className={`flex items-center gap-2 px-4 py-3 rounded-lg border text-sm ${
            feedback.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-700'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          {feedback.type === 'success' ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          <span>{feedback.message}</span>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Available slots</h3>
          {loadingSlots && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading...
            </div>
          )}
        </div>
        <div className="p-6">
          {plannerDisabled ? (
            <div className="text-center text-sm text-blue-700">
              {disabledReason || 'Monthly planning will become available once your group is linked to a club.'}
            </div>
          ) : slots.length === 0 ? (
            <div className="text-center text-sm text-gray-600">
              No free slots were found for this month. Try another month or check back later.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">Date</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">Time</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">Court</th>
                    <th className="px-4 py-2 text-right font-medium text-gray-600">Price</th>
                    <th className="px-4 py-2 text-center font-medium text-gray-600">Select</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {slots.map((slot) => {
                    const selected = selectedSlotIds.includes(slot.slot_id);
                    return (
                      <tr key={slot.slot_id} className={selected ? 'bg-green-50' : undefined}>
                        <td className="px-4 py-3 text-gray-900 font-medium">
                          {format(new Date(slot.slot_date), 'EEE, dd MMM')}
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          {slot.start_time} – {slot.end_time}
                        </td>
                        <td className="px-4 py-3 text-gray-700">{slot.court_name}</td>
                        <td className="px-4 py-3 text-right text-gray-900 font-semibold">
                          {formatPrice(Number(slot.effective_price) || 0)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <input
                            type="checkbox"
                            className="h-4 w-4 text-green-600 rounded border-gray-300"
                            checked={selected}
                            onChange={() => toggleSlot(slot.slot_id)}
                            disabled={submitting || plannerDisabled}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm text-gray-600">Selected slots</p>
            <p className="text-2xl font-semibold text-gray-900">{bookingCount}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Total amount</p>
            <p className="text-2xl font-semibold text-green-700">{formatPrice(totalAmount)}</p>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={
              mode === 'group'
                ? 'Share any special instructions for the club (optional)'
                : 'Add notes for this group submission (optional)'
            }
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
            disabled={submitting || plannerDisabled}
          />
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || bookingCount === 0 || plannerDisabled}
            className="px-6 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:bg-green-300 disabled:cursor-not-allowed"
          >
            {submitting ? 'Submitting…' : 'Submit monthly plan'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default GroupMonthlyBooking;
