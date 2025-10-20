// ======================================================================
// FILE: src/lib/bookings.ts
// Purpose: Frontend access to unified club/day slot bookings via RPC
// Depends on: src/lib/supabaseClient.ts exporting `supabase`
// ======================================================================
import { supabase } from './supabaseClient';

export type SlotBookingRow = {
  slot_id: string;
  court_id: string;
  club_id: string;
  slot_date: string;            // 'YYYY-MM-DD'
  start_time: string;           // 'HH:MM:SS'
  end_time: string;             // 'HH:MM:SS'
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

/** Calls RPC: get_club_day_slot_bookings(p_club_id uuid, p_day date) */
export async function getClubDaySlotBookings(params: { clubId: string; day: string }) {
  const { data, error } = await supabase.rpc('get_club_day_slot_bookings', {
    p_club_id: params.clubId,
    p_day: params.day,
  });
  if (error) {
    // Why: surface backend errors for faster debugging
    throw new Error(error.message || 'Failed to load slot bookings');
  }
  return (data ?? []) as SlotBookingRow[];
}

/** Optional grouping helper for UI rendering */
export function groupByCourtAndTime(rows: SlotBookingRow[]) {
  const byCourt: Record<string, SlotBookingRow[]> = {};
  for (const r of rows) (byCourt[r.court_id] ||= []).push(r);
  for (const k of Object.keys(byCourt)) {
    byCourt[k].sort((a, b) => a.start_time.localeCompare(b.start_time));
  }
  return byCourt;
}
