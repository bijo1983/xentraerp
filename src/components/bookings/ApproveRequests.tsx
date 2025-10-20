// FILE: src/components/bookings/ApproveRequests.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';

// ---- Types matching your RPC return (adjust if your RPC shape differs) ----
type SlotBookingRow = {
  slot_id: string;
  court_id: string;
  club_id: string;
  slot_date: string;            // YYYY-MM-DD
  start_time: string;           // HH:MM:SS
  end_time: string;             // HH:MM:SS
  court_name: string | null;

  booking_source: 'single_booking' | 'group_booking' | 'group_batch_item';
  booking_id: string | null;
  batch_item_id: string | null;
  batch_id: string | null;

  booking_status: string | null;
  batch_status: string | null;

  player_id: string | null;
  player_name: string | null;
  group_id: string | null;
  group_name: string | null;
};

type FilterKey = 'all' | 'single' | 'group' | 'batch';

// ---- Helpers (inline to avoid import alias issues) ----
async function getClubDaySlotBookings(params: { clubId: string; day: string }) {
  const { data, error } = await supabase.rpc('get_club_day_slot_bookings', {
    p_club_id: params.clubId,
    p_day: params.day,
  });
  if (error) throw new Error(error.message || 'Failed to load slot bookings');
  return (data ?? []) as SlotBookingRow[];
}

function groupByCourt(rows: SlotBookingRow[]) {
  const by: Record<string, SlotBookingRow[]> = {};
  for (const r of rows) (by[r.court_id] ||= []).push(r);
  for (const k of Object.keys(by)) by[k].sort((a, b) => a.start_time.localeCompare(b.start_time));
  return by;
}

function fmtTime(t?: string) {
  return t ? t.slice(0, 5) : '';
}

// ---- Component ----
export const ApproveRequests: React.FC = () => {
  const [clubId, setClubId] = useState<string | null>(null);
  const [day, setDay] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<SlotBookingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [busyId, setBusyId] = useState<string | null>(null);

  // Resolve club id for current user (assumes exactly one club profile)
  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return setErr('Not signed in.');
      const { data, error } = await supabase
        .from('club_users')
        .select('id')
        .eq('user_id', uid)
        .limit(1)
        .maybeSingle();
      if (error) return setErr(error.message);
      if (!data?.id) return setErr('No club profile found for user.');
      setClubId(data.id);
    })();
  }, []);

  // Load unified bookings (singles + group + batch items)
  useEffect(() => {
    if (!clubId || !day) return;
    let alive = true;
    setLoading(true);
    setErr(null);
    getClubDaySlotBookings({ clubId, day })
      .then((d) => {
        if (alive) setRows(d);
      })
      .catch((e) => {
        if (alive) setErr(e.message ?? 'Failed to load');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [clubId, day]);

  const filtered = useMemo(() => {
    switch (filter) {
      case 'single':
        return rows.filter((r) => r.booking_source === 'single_booking');
      case 'group':
        return rows.filter((r) => r.booking_source === 'group_booking');
      case 'batch':
        return rows.filter((r) => r.booking_source === 'group_batch_item');
      default:
        return rows;
    }
  }, [rows, filter]);

  const grouped = useMemo(() => groupByCourt(filtered), [filtered]);

  async function approveSingleBooking(id: string) {
    setBusyId(id);
    const { error } = await supabase.from('bookings').update({ status: 'approved' }).eq('id', id);
    setBusyId(null);
    if (error) return setErr(error.message);
    if (clubId && day) setRows(await getClubDaySlotBookings({ clubId, day }));
  }

  async function rejectSingleBooking(id: string) {
    setBusyId(id);
    const { error } = await supabase.from('bookings').update({ status: 'rejected' }).eq('id', id);
    setBusyId(null);
    if (error) return setErr(error.message);
    if (clubId && day) setRows(await getClubDaySlotBookings({ clubId, day }));
  }

  async function approveBatchItem(batchItemId: string | null, batchId: string | null) {
    const key = batchItemId ?? (batchId as string);
    setBusyId(key);
    if (batchItemId) {
      const { error } = await supabase
        .from('booking_batch_items')
        .update({ status: 'approved' })
        .eq('id', batchItemId);
      if (error) {
        setBusyId(null);
        return setErr(error.message);
      }
    }
    if (batchId) {
      const { error } = await supabase.from('booking_batches').update({ status: 'approved' }).eq('id', batchId);
      if (error) {
        setBusyId(null);
        return setErr(error.message);
      }
    }
    setBusyId(null);
    if (clubId && day) setRows(await getClubDaySlotBookings({ clubId, day }));
  }

  async function rejectBatchItem(batchItemId: string | null, batchId: string | null) {
    const key = batchItemId ?? (batchId as string);
    setBusyId(key);
    if (batchItemId) {
      const { error } = await supabase
        .from('booking_batch_items')
        .update({ status: 'rejected' })
        .eq('id', batchItemId);
      if (error) {
        setBusyId(null);
        return setErr(error.message);
      }
    }
    if (batchId) {
      const { error } = await supabase.from('booking_batches').update({ status: 'rejected' }).eq('id', batchId);
      if (error) {
        setBusyId(null);
        return setErr(error.message);
      }
    }
    setBusyId(null);
    if (clubId && day) setRows(await getClubDaySlotBookings({ clubId, day }));
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-semibold">Approve Requests</h1>
        <input
          type="date"
          className="border rounded px-2 py-1"
          value={day}
          onChange={(e) => setDay(e.target.value)}
        />
        <select
          className="border rounded px-2 py-1"
          value={filter}
          onChange={(e) => setFilter(e.target.value as FilterKey)}
        >
          <option value="all">All</option>
          <option value="single">Singles</option>
          <option value="group">Group (bookings)</option>
          <option value="batch">Group (batch items)</option>
        </select>
        <button
          className="border rounded px-3 py-1"
          onClick={() => clubId && day && getClubDaySlotBookings({ clubId, day }).then(setRows)}
        >
          Refresh
        </button>
        <div className="text-sm opacity-70">{rows.length} records</div>
      </header>

      {err && <div className="text-red-600">{err}</div>}
      {loading && <div>Loading…</div>}
      {!loading && !rows.length && <div className="border rounded p-3">No requests for {day}.</div>}

      {!loading && !!rows.length && (
        <div className="space-y-4">
          {Object.entries(grouped).map(([courtId, list]) => (
            <section key={courtId} className="border rounded p-3">
              <div className="font-semibold mb-2">
                {list[0].court_name ?? 'Court'} · {list.length} item(s)
              </div>
              <div className="grid md:grid-cols-2 gap-2">
                {list.map((r) => {
                  const key = r.booking_id ?? r.batch_item_id ?? r.slot_id;
                  const isBatch = r.booking_source === 'group_batch_item';
                  const isBusy = busyId === key;

                  return (
                    <div key={key} className="border rounded p-3">
                      <div className="text-xs uppercase opacity-60">
                        {r.booking_source.replaceAll('_', ' ')}
                      </div>
                      <div className="font-medium">
                        {fmtTime(r.start_time)}–{fmtTime(r.end_time)}
                      </div>
                      <div className="text-sm">
                        {r.player_name
                          ? `Player: ${r.player_name}`
                          : r.group_name
                          ? `Group: ${r.group_name}`
                          : '—'}
                      </div>
                      <div className="text-xs opacity-70">
                        Status: {r.booking_status ?? r.batch_status ?? '-'} · Slot{' '}
                        {r.slot_id.slice(0, 8)}…
                      </div>

                      <div className="mt-2 flex gap-2">
                        {isBatch ? (
                          <>
                            <button
                              disabled={isBusy}
                              className="border rounded px-3 py-1"
                              onClick={() => approveBatchItem(r.batch_item_id, r.batch_id)}
                            >
                              {isBusy ? '…' : 'Approve'}
                            </button>
                            <button
                              disabled={isBusy}
                              className="border rounded px-3 py-1"
                              onClick={() => rejectBatchItem(r.batch_item_id, r.batch_id)}
                            >
                              {isBusy ? '…' : 'Reject'}
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              disabled={isBusy || !r.booking_id}
                              className="border rounded px-3 py-1"
                              onClick={() => r.booking_id && approveSingleBooking(r.booking_id)}
                            >
                              {isBusy ? '…' : 'Approve'}
                            </button>
                            <button
                              disabled={isBusy || !r.booking_id}
                              className="border rounded px-3 py-1"
                              onClick={() => r.booking_id && rejectSingleBooking(r.booking_id)}
                            >
                              {isBusy ? '…' : 'Reject'}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
};

// Export both named and default to satisfy any import style
export default ApproveRequests;
