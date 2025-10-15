// src/pages/club/ManageBookings.tsx
import React, { useEffect, useState } from 'react';
import { Clock, Plus, Search } from 'lucide-react';
import { format, addDays } from 'date-fns';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { useCurrency } from '../../hooks/useCurrency';

/* ========================== Types ========================== */

type PlayerUser = {
  id: string;
  full_name: string;
  email: string;
  phone_number?: string | null;
  countries?: { name: string; currency_code: string } | null;
};

type Court = {
  id: string;
  name: string;
  hourly_rate: number;
  surface_type?: string | null;
  club_id?: string | null; // FK -> club_users.id
};

type Booking = {
  id: string;
  total_amount: number;
  status: 'pending' | 'approved' | 'cancelled' | 'rejected';
  payment_status: 'pending' | 'paid' | 'completed';
  notes?: string | null;
  player_id: string;
  player_users?: {
    full_name: string;
    email: string;
    phone_number?: string | null;
  } | null;
};

type SlotRow = {
  id: string;
  court_id: string;
  date: string;
  start_time: string;
  end_time: string;
  is_booked: boolean;
  custom_price?: number | null;
  courts?: {
    hourly_rate: number;
  } | null;
  bookings?: Booking[]; // joined array
};

type EnrichedSlot = SlotRow & {
  calculated_price: number;
  booking: Booking | null;
  isBookedComputed: boolean;
};

/* ====================== Component ========================= */

export const ManageBookings: React.FC = () => {
  const { userProfile } = useAuthStore();
  const { formatPrice } = useCurrency();

  const [courts, setCourts] = useState<Court[]>([]);
  const [selectedCourt, setSelectedCourt] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [availableSlots, setAvailableSlots] = useState<EnrichedSlot[]>([]);

  // Players (now driven by RPC search)
  const [players, setPlayers] = useState<PlayerUser[]>([]);
  const [playerSearch, setPlayerSearch] = useState('');
  const [playersLoading, setPlayersLoading] = useState(false);

  const [selectedSlot, setSelectedSlot] = useState<EnrichedSlot | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<string>('');
  const [bookingNotes, setBookingNotes] = useState('');

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [bookingDetails, setBookingDetails] = useState<any>(null);

  const [loading, setLoading] = useState(false);

  /* -------------------- Effects -------------------- */

  useEffect(() => {
    if (userProfile) {
      fetchCourts();
      // Don't prefetch all players — we will call RPC on open modal / search.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfile]);

  useEffect(() => {
    if (selectedCourt && selectedDate) {
      fetchAvailableSlots();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCourt, selectedDate]);

  // When Create Booking modal opens, load initial players (empty query)
  useEffect(() => {
    if (showCreateModal) {
      void searchPlayersRPC(''); // initial list per RLS visibility
    } else {
      // cleanup state when closed
      setPlayers([]);
      setPlayerSearch('');
      setSelectedPlayer('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCreateModal]);

  // Debounced player search via RPC
  useEffect(() => {
    if (!showCreateModal) return;
    const t = setTimeout(() => {
      void searchPlayersRPC(playerSearch);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerSearch, showCreateModal]);

  /* -------------------- Data loaders -------------------- */

  // Get club_users.id for this user, then courts.club_id = that id
  const fetchCourts = async () => {
    if (!userProfile) return;

    try {
      const { data: clubUser, error: clubErr } = await supabase
        .from('club_users')
        .select('id')
        .eq('user_id', userProfile.user_id)
        .single();

      if (clubErr || !clubUser) {
        console.error('[ManageBookings] club_users lookup failed:', clubErr);
        setCourts([]);
        return;
      }

      const clubId = clubUser.id;

      const { data: courtRows, error: courtErr } = await supabase
        .from('courts')
        .select('id, name, hourly_rate, surface_type, club_id')
        .eq('club_id', clubId)
        .order('name');

      if (courtErr) {
        console.error('[ManageBookings] courts load failed:', courtErr);
        setCourts([]);
        return;
      }

      const list = (courtRows ?? []) as Court[];
      setCourts(list);
      if (list.length > 0 && !list.some((c) => c.id === selectedCourt)) {
        setSelectedCourt(list[0].id);
      }
    } catch (e) {
      console.error('[ManageBookings] fetchCourts exception:', e);
      setCourts([]);
    }
  };

  // RPC search (contains name/email/phone) with RLS scoping
  const searchPlayersRPC = async (q: string) => {
    try {
      setPlayersLoading(true);
      const { data, error } = await supabase.rpc('search_players', {
        q: q ?? '',
        p_limit: 50,
        p_offset: 0
      });
      if (error) {
        console.error('[ManageBookings] search_players RPC error:', error);
        setPlayers([]);
        return;
      }
      setPlayers((data ?? []) as PlayerUser[]);
    } catch (err) {
      console.error('[ManageBookings] searchPlayersRPC exception:', err);
      setPlayers([]);
    } finally {
      setPlayersLoading(false);
    }
  };

  const fetchAvailableSlots = async () => {
    if (!selectedCourt || !selectedDate) return;

    const dateStr = format(selectedDate, 'yyyy-MM-dd');

    // Keep the join minimal to avoid RLS recursion issues.
    const { data, error } = await supabase
      .from('court_slots')
      .select(
        `
        id, court_id, date, start_time, end_time, is_booked, custom_price,
        courts ( hourly_rate ),
        bookings (
          id, total_amount, status, payment_status, notes, player_id,
          player_users ( full_name, email, phone_number )
        )
      `
      )
      .eq('court_id', selectedCourt)
      .eq('date', dateStr)
      .order('start_time');

    if (error) {
      console.error('Error fetching slots:', error);
      setAvailableSlots([]);
      return;
    }

    const rows = (data ?? []) as SlotRow[];

    // Compute price per slot (prefer server RPC if present, otherwise base rate)
    const slotsWithPricing: EnrichedSlot[] = await Promise.all(
      rows.map(async (slot) => {
        let calcPrice: number | null = null;

        try {
          const { data: priceData, error: priceErr } = await supabase.rpc('calculate_slot_price', {
            p_court_id: slot.court_id,
            p_date: dateStr,
            p_start_time: slot.start_time,
            p_end_time: slot.end_time
          });
          if (!priceErr && typeof priceData === 'number') {
            calcPrice = priceData;
          }
        } catch {
          // fall back below
        }

        const activeBooking =
          (slot.bookings ?? []).find((b) => b.status !== 'cancelled' && b.status !== 'rejected') ?? null;

        return {
          ...slot,
          calculated_price: (slot.custom_price ?? calcPrice ?? slot.courts?.hourly_rate ?? 0),
          booking: activeBooking,
          isBookedComputed: !!activeBooking
        };
      })
    );

    setAvailableSlots(slotsWithPricing);
  };

  /* -------------------- UI actions -------------------- */

  const openCreateBookingModal = async (slot: EnrichedSlot) => {
    if (slot.isBookedComputed) {
      await fetchBookingDetails(slot.id);
    } else {
      setSelectedSlot(slot);
      setSelectedPlayer('');
      setBookingNotes('');
      setPlayerSearch('');
      setShowCreateModal(true);
    }
  };

  const fetchBookingDetails = async (slotId: string) => {
    try {
      const { data, error } = await supabase
        .from('bookings')
        .select(
          `
          *,
          player_users ( full_name, email, phone_number ),
          court_slots ( start_time, end_time )
        `
        )
        .eq('slot_id', slotId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching booking details:', error);
        return;
      }

      if (data) {
        setBookingDetails(data);
        setSelectedSlot((prev) =>
          ({
            ...(prev || {}),
            id: slotId,
            start_time: data.court_slots?.start_time,
            end_time: data.court_slots?.end_time,
            calculated_price: data.total_amount,
            isBookedComputed: true,
            booking: data
          } as EnrichedSlot)
        );
        setShowBookingModal(true);
      }
    } catch (err) {
      console.error('Error fetching booking details:', err);
    }
  };

  const updateBookingStatus = async (
    bookingId: string,
    newStatus: 'approved' | 'cancelled' | 'rejected' | 'pending'
  ) => {
    setLoading(true);
    try {
      const { error } = await supabase.from('bookings').update({ status: newStatus }).eq('id', bookingId);
      if (error) throw error;

      if (newStatus === 'cancelled' && selectedSlot?.id) {
        const { error: slotError } = await supabase
          .from('court_slots')
          .update({ is_booked: false })
          .eq('id', selectedSlot.id);
        if (slotError) throw slotError;
      }

      alert('Booking updated successfully!');
      setShowBookingModal(false);
      setBookingDetails(null);
      fetchAvailableSlots();
    } catch (err) {
      console.error('Error updating booking:', err);
      alert('Error updating booking. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const createBooking = async () => {
    if (!selectedSlot || !selectedPlayer) {
      alert('Please select a player');
      return;
    }

    setLoading(true);
    try {
      const bookingAmount = selectedSlot.custom_price ?? selectedSlot.calculated_price ?? 0;

      const { error: bookingError } = await supabase.from('bookings').insert({
        player_id: selectedPlayer,
        slot_id: selectedSlot.id,
        total_amount: bookingAmount,
        status: 'pending',
        payment_status: 'pending',
        notes: bookingNotes || null
      });

      if (bookingError) throw bookingError;

      const { error: slotError } = await supabase
        .from('court_slots')
        .update({ is_booked: true })
        .eq('id', selectedSlot.id);

      if (slotError) throw slotError;

      alert('Booking created successfully!');
      setShowCreateModal(false);
      setSelectedSlot(null);
      setSelectedPlayer('');
      setBookingNotes('');
      fetchAvailableSlots();
    } catch (err) {
      console.error('Error creating booking:', err);
      alert('Error creating booking. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  /* -------------------- Helpers -------------------- */

  const getSelectedCourtInfo = () => courts.find((c) => c.id === selectedCourt);

  /* -------------------- Render -------------------- */

  return (
    <div className="space-y-8">
      <div className="bg-gradient-to-r from-green-600 to-teal-600 rounded-xl p-8 text-white">
        <h1 className="text-3xl font-bold mb-2">Manage Bookings</h1>
        <p className="text-green-100">Create and manage court bookings for players</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Select Court</label>
            <select
              value={selectedCourt}
              onChange={(e) => setSelectedCourt(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
            >
              <option value="">Select a court</option>
              {courts.map((court) => (
                <option key={court.id} value={court.id}>
                  {court.name} ({formatPrice(court.hourly_rate)}/hr)
                </option>
              ))}
            </select>
            {courts.length === 0 && (
              <p className="mt-2 text-sm text-gray-500">
                No courts found for your club membership. Check club membership and RLS policies.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Select Date</label>
            <input
              type="date"
              value={format(selectedDate, 'yyyy-MM-dd')}
              onChange={(e) => setSelectedDate(new Date(e.target.value))}
              min={format(new Date(), 'yyyy-MM-dd')}
              max={format(addDays(new Date(), 365), 'yyyy-MM-dd')}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
            />
          </div>
        </div>

        {selectedCourt && (
          <div className="mt-4 p-4 bg-green-50 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-green-900">{getSelectedCourtInfo()?.name}</h3>
                <p className="text-sm text-green-700">{getSelectedCourtInfo()?.surface_type ?? '—'} Surface</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-semibold text-green-900">
                  {formatPrice(getSelectedCourtInfo()?.hourly_rate || 0)}/hour
                </p>
                <p className="text-sm text-green-600">Base Rate</p>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center">
            <Clock className="h-5 w-5 text-green-600 mr-2" />
            Available Slots - {format(selectedDate, 'EEEE, MMM d, yyyy')}
          </h2>
        </div>
        <div className="p-6">
          {availableSlots.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {availableSlots.map((slot) => {
                const booked = slot.isBookedComputed;
                return (
                  <div
                    key={slot.id}
                    className={`group relative rounded-lg border-2 transition-all duration-200 overflow-hidden ${
                      booked
                        ? 'bg-gradient-to-br from-red-50 to-rose-50 border-red-300 hover:border-red-400'
                        : 'bg-gradient-to-br from-green-50 to-teal-50 border-green-200 hover:border-green-400'
                    }`}
                  >
                    <div className="p-4 space-y-2">
                      <div className="text-center">
                        <p className="font-semibold text-gray-900 text-sm">{slot.start_time}</p>
                        <p className="text-xs text-gray-500">to</p>
                        <p className="font-semibold text-gray-900 text-sm">{slot.end_time}</p>
                      </div>
                      <div className={`pt-2 border-t ${booked ? 'border-red-200' : 'border-green-200'}`}>
                        <p
                          className={`text-center font-bold text-base ${
                            booked ? 'text-red-700' : 'text-green-700'
                          }`}
                        >
                          {formatPrice(slot.custom_price ?? slot.calculated_price)}
                        </p>
                        {booked && slot.booking && (
                          <p className="text-xs text-center text-red-600 mt-1 font-medium">Booked</p>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => openCreateBookingModal(slot)}
                      className={`absolute inset-0 flex items-center justify-center bg-opacity-0 group-hover:bg-opacity-90 transition-all duration-200 ${
                        booked ? 'bg-red-600 cursor-pointer' : 'bg-green-600'
                      }`}
                    >
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col items-center space-y-1">
                        {booked ? (
                          <>
                            <Clock className="h-8 w-8 text-white" />
                            <span className="text-white font-medium text-sm">View Details</span>
                          </>
                        ) : (
                          <>
                            <Plus className="h-8 w-8 text-white" />
                            <span className="text-white font-medium text-sm">Book</span>
                          </>
                        )}
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12">
              <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Available Slots</h3>
              <p className="text-gray-600">All slots are booked or no slots have been created for this date.</p>
            </div>
          )}
        </div>
      </div>

      {/* Booking details modal */}
      {showBookingModal && bookingDetails && selectedSlot && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Booking Details</h3>

              <div className="space-y-4">
                <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-500 mb-1">Time Slot</label>
                    <p className="text-gray-900 font-medium">
                      {bookingDetails.court_slots?.start_time || selectedSlot.start_time} -{' '}
                      {bookingDetails.court_slots?.end_time || selectedSlot.end_time}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-500 mb-1">Player</label>
                    <p className="text-gray-900 font-medium">{bookingDetails.player_users?.full_name}</p>
                    <p className="text-sm text-gray-600">{bookingDetails.player_users?.email}</p>
                    {bookingDetails.player_users?.phone_number && (
                      <p className="text-sm text-gray-600">{bookingDetails.player_users.phone_number}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-500 mb-1">Amount</label>
                    <p className="text-gray-900 font-medium">{formatPrice(bookingDetails.total_amount)}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-500 mb-1">Status</label>
                      <span
                        className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
                          bookingDetails.status === 'approved'
                            ? 'bg-green-100 text-green-800'
                            : bookingDetails.status === 'pending'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {bookingDetails.status}
                      </span>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-500 mb-1">Payment</label>
                      <span
                        className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
                          bookingDetails.payment_status === 'completed' || bookingDetails.payment_status === 'paid'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}
                      >
                        {bookingDetails.payment_status}
                      </span>
                    </div>
                  </div>

                  {bookingDetails.notes && (
                    <div>
                      <label className="block text-sm font-medium text-gray-500 mb-1">Notes</label>
                      <p className="text-gray-900 text-sm">{bookingDetails.notes}</p>
                    </div>
                  )}
                </div>

                <div className="flex space-x-3 pt-4">
                  <button
                    onClick={() => {
                      setShowBookingModal(false);
                      setBookingDetails(null);
                    }}
                    className="w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create booking modal */}
      {showCreateModal && selectedSlot && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Create Booking</h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Time Slot</label>
                  <p className="text-gray-900 font-medium">
                    {selectedSlot.start_time} - {selectedSlot.end_time}
                  </p>
                  <p className="text-sm text-gray-600">
                    {formatPrice(selectedSlot.custom_price ?? selectedSlot.calculated_price)}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Search Player</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input
                      type="text"
                      value={playerSearch}
                      onChange={(e) => setPlayerSearch(e.target.value)}
                      placeholder="Search by name, email, or phone"
                      className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    />
                  </div>
                  {playersLoading && (
                    <p className="mt-1 text-xs text-gray-500">Searching…</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Select Player</label>
                  <select
                    value={selectedPlayer}
                    onChange={(e) => setSelectedPlayer(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  >
                    <option value="">Choose a player</option>
                    {players.map((player) => (
                      <option key={player.id} value={player.id}>
                        {player.full_name} ({player.email}
                        {player.phone_number ? ` • ${player.phone_number}` : ''})
                      </option>
                    ))}
                  </select>
                  {players.length === 0 && !playersLoading && (
                    <p className="text-xs text-gray-500 mt-1">No players found.</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Notes (Optional)</label>
                  <textarea
                    value={bookingNotes}
                    onChange={(e) => setBookingNotes(e.target.value)}
                    rows={3}
                    placeholder="Add any special notes or requirements"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  />
                </div>

                <div className="flex space-x-3 pt-4">
                  <button
                    onClick={createBooking}
                    disabled={loading || !selectedPlayer}
                    className="flex-1 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {loading ? 'Creating...' : 'Create Booking'}
                  </button>
                  <button
                    onClick={() => {
                      setShowCreateModal(false);
                      setSelectedSlot(null);
                      setSelectedPlayer('');
                      setBookingNotes('');
                      setPlayerSearch('');
                    }}
                    className="flex-1 px-4 py-3 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
