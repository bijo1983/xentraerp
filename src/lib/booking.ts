import { supabase } from './supabaseClient';

export type SlotBookingRow = {
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

export async function getClubDaySlotBookings(params: { clubId: string; day: string }) {
  const { data, error } = await supabase.rpc('get_club_day_slot_bookings', {
    p_club_id: params.clubId,
    p_day: params.day,
  });
  if (error) throw new Error(error.message || 'Failed to load slot bookings');
  return (data ?? []) as SlotBookingRow[];
}

export function groupByCourt(rows: SlotBookingRow[]) {
  const by: Record<string, SlotBookingRow[]> = {};
  for (const r of rows) (by[r.court_id] ||= []).push(r);
  for (const k of Object.keys(by)) by[k].sort((a,b)=>a.start_time.localeCompare(b.start_time));
  return by;
}
