import React, { useState, useEffect } from 'react';
import { Calendar, User, CheckCircle, XCircle, Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { useCurrency } from '../../hooks/useCurrency';
import { format, startOfMonth, endOfMonth } from 'date-fns';

export const ViewBookings: React.FC = () => {
  const { userProfile } = useAuthStore();
  const { formatPrice } = useCurrency();
  const [courts, setCourts] = useState<any[]>([]);
  const [selectedCourt, setSelectedCourt] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (userProfile) {
      fetchCourts();
    }
  }, [userProfile]);

  useEffect(() => {
    if (selectedCourt && selectedMonth) {
      fetchMonthlyBookings();
    }
  }, [selectedCourt, selectedMonth]);

  const fetchCourts = async () => {
    if (!userProfile) return;

    const { data: clubData, error: clubError } = await supabase
      .from('club_users')
      .select('id')
      .eq('user_id', userProfile.user_id)
      .single();

    if (clubError || !clubData) {
      console.error('Error fetching club data:', clubError);
      return;
    }

    const { data, error } = await supabase
      .from('courts')
      .select('*')
      .eq('club_id', clubData.id)
      .order('name');

    if (data) {
      setCourts(data);
      if (data.length > 0 && !selectedCourt) {
        setSelectedCourt(data[0].id);
      }
    }
  };

  const fetchMonthlyBookings = async () => {
    if (!selectedCourt || !selectedMonth) return;

    const monthDate = new Date(selectedMonth + '-01');
    const startDate = format(startOfMonth(monthDate), 'yyyy-MM-dd');
    const endDate = format(endOfMonth(monthDate), 'yyyy-MM-dd');

    try {
      const { data, error } = await supabase.rpc('get_club_monthly_bookings', {
        p_court_id: selectedCourt,
        p_start_date: startDate,
        p_end_date: endDate
      });

      if (error) throw error;

      const transformedData = data?.map((booking: any) => {
        const groupName =
          booking.group_name ||
          booking.group_users?.group_name ||
          (booking.group?.group_name ?? null);

        return {
          id: booking.booking_id,
          status: booking.booking_status,
          payment_status: booking.payment_status,
          total_amount: booking.total_amount,
          notes: booking.booking_notes,
          created_at: booking.booking_created_at,
          slot_id: booking.slot_id,
          player_users: {
            id: booking.player_id,
            full_name: booking.player_name,
            email: booking.player_email,
            phone_number: booking.player_phone
          },
          group: booking.group_id
            ? {
                id: booking.group_id,
                name: groupName,
              }
            : null,
          court_slots: {
            id: booking.slot_id,
            date: booking.slot_date,
            start_time: booking.slot_start_time,
            end_time: booking.slot_end_time,
            court_id: booking.court_id,
            courts: {
              id: booking.court_id,
              name: booking.court_name,
              hourly_rate: booking.court_hourly_rate
            }
          }
        };
      }) || [];

      setBookings(transformedData);
    } catch (error) {
      console.error('Error fetching monthly bookings:', error);
    }
  };

  const approveBooking = async (booking: any) => {
    setLoading(true);
    try {
      const { error: bookingError } = await supabase
        .from('bookings')
        .update({ status: 'approved' })
        .eq('id', booking.id);

      if (bookingError) throw bookingError;

      const { error: slotError } = await supabase
        .from('court_slots')
        .update({ is_booked: true })
        .eq('id', booking.slot_id);

      if (slotError) throw slotError;

      alert('Booking approved successfully!');
      fetchMonthlyBookings();
    } catch (error) {
      console.error('Error approving booking:', error);
      alert('Error approving booking. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const rejectBooking = async (booking: any) => {
    if (!confirm('Are you sure you want to reject this booking request?')) return;

    setLoading(true);
    try {
      const { error: bookingError } = await supabase
        .from('bookings')
        .update({ status: 'rejected' })
        .eq('id', booking.id);

      if (bookingError) throw bookingError;

      alert('Booking rejected!');
      fetchMonthlyBookings();
    } catch (error) {
      console.error('Error rejecting booking:', error);
      alert('Error rejecting booking. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const cancelBooking = async (booking: any) => {
    if (!confirm('Are you sure you want to cancel this booking?')) return;

    setLoading(true);
    try {
      const { error: bookingError } = await supabase
        .from('bookings')
        .update({ status: 'cancelled' })
        .eq('id', booking.id);

      if (bookingError) throw bookingError;

      const { error: slotError } = await supabase
        .from('court_slots')
        .update({ is_booked: false })
        .eq('id', booking.slot_id);

      if (slotError) throw slotError;

      alert('Booking cancelled successfully!');
      fetchMonthlyBookings();
    } catch (error) {
      console.error('Error cancelling booking:', error);
      alert('Error cancelling booking. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const updatePaymentStatus = async (bookingId: string, newStatus: string) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('bookings')
        .update({ payment_status: newStatus })
        .eq('id', bookingId);

      if (error) throw error;

      alert('Payment status updated successfully!');
      fetchMonthlyBookings();
    } catch (error) {
      console.error('Error updating payment status:', error);
      alert('Error updating payment status. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getSelectedCourtInfo = () => {
    return courts.find(court => court.id === selectedCourt);
  };

  return (
    <div className="space-y-8">
      <div className="bg-gradient-to-r from-blue-600 to-cyan-600 rounded-xl p-8 text-white">
        <h1 className="text-3xl font-bold mb-2">Current Bookings</h1>
        <p className="text-blue-100">View and manage all court bookings</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Court
            </label>
            <select
              value={selectedCourt}
              onChange={(e) => setSelectedCourt(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Select a court</option>
              {courts.map((court) => (
                <option key={court.id} value={court.id}>
                  {court.name} ({formatPrice(court.hourly_rate)}/hr)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Month
            </label>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        {selectedCourt && (
          <div className="mt-4 p-4 bg-blue-50 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-blue-900">
                  {getSelectedCourtInfo()?.name}
                </h3>
                <p className="text-sm text-blue-700">
                  {getSelectedCourtInfo()?.surface_type} Surface
                </p>
              </div>
              <div className="text-right">
                <p className="text-lg font-semibold text-blue-900">
                  {formatPrice(getSelectedCourtInfo()?.hourly_rate || 0)}/hour
                </p>
                <p className="text-sm text-blue-600">Base Rate</p>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center">
            <Calendar className="h-5 w-5 text-blue-600 mr-2" />
            Bookings - {format(new Date(selectedMonth + '-01'), 'MMMM yyyy')}
          </h2>
        </div>
        <div className="overflow-x-auto">
          {bookings.length > 0 ? (
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date & Time
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Player / Group
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Contact
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Approval Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Payment Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {bookings.map((booking) => {
                  const normalizedStatus = booking.status || 'pending';
                  const normalizedPaymentStatus = booking.payment_status || 'pending';

                  return (
                    <tr key={booking.id} className={normalizedStatus === 'cancelled' ? 'bg-red-50' : ''}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{booking.court_slots.date}</div>
                        <div className="text-sm text-gray-500">
                          {booking.court_slots.start_time} - {booking.court_slots.end_time}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="space-y-1">
                          <div className="flex items-center">
                            <User className="h-4 w-4 mr-2 text-gray-400" />
                            <div className="text-sm font-medium text-gray-900">
                              {booking.player_users.full_name || '—'}
                            </div>
                          </div>
                          {booking.group && (
                            <div className="flex items-center text-xs text-gray-600">
                              <Users className="h-3.5 w-3.5 mr-1 text-gray-400" />
                              <span>Group: {booking.group.name || 'Group booking'}</span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {booking.group ? (
                          <div className="text-sm text-gray-600">Group booking</div>
                        ) : (
                          <>
                            <div className="text-sm text-gray-900">{booking.player_users.email}</div>
                            {booking.player_users.phone_number && (
                              <div className="text-sm text-gray-500">{booking.player_users.phone_number}</div>
                            )}
                          </>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{formatPrice(booking.total_amount)}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            normalizedStatus === 'approved'
                              ? 'bg-green-100 text-green-800'
                              : normalizedStatus === 'pending'
                              ? 'bg-yellow-100 text-yellow-800'
                              : normalizedStatus === 'rejected'
                              ? 'bg-red-100 text-red-800'
                              : normalizedStatus === 'cancelled'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {normalizedStatus}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            normalizedPaymentStatus === 'paid'
                              ? 'bg-blue-100 text-blue-800'
                              : normalizedPaymentStatus === 'pending'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {normalizedPaymentStatus}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div className="flex flex-col space-y-2">
                          {normalizedStatus === 'pending' && (
                            <div className="flex space-x-2">
                              <button
                                onClick={() => approveBooking(booking)}
                                disabled={loading}
                                className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
                                title="Approve booking"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => rejectBooking(booking)}
                                disabled={loading}
                                className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                                title="Reject booking"
                              >
                                Reject
                              </button>
                            </div>
                          )}
                          {normalizedStatus === 'approved' && (
                            <div className="flex flex-col space-y-1">
                              {normalizedPaymentStatus === 'pending' && (
                                <button
                                  onClick={() => updatePaymentStatus(booking.id, 'paid')}
                                  disabled={loading}
                                  className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                                  title="Mark as paid"
                                >
                                  Mark Paid
                                </button>
                              )}
                              <button
                                onClick={() => cancelBooking(booking)}
                                disabled={loading}
                                className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                                title="Cancel booking"
                              >
                                Cancel
                              </button>
                            </div>
                          )}
                        </div>
                        {booking.notes && (
                          <div className="mt-2 text-xs text-gray-500 italic" title={booking.notes}>
                            {booking.notes.length > 30 ? booking.notes.substring(0, 30) + '...' : booking.notes}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="text-center py-12">
              <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Bookings</h3>
              <p className="text-gray-600">No bookings found for this court and month.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
