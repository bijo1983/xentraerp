import React, { useState, useEffect } from 'react';
import { Calendar, MapPin, Clock, DollarSign, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { useCurrency } from '../../hooks/useCurrency';

interface Booking {
  id: string;
  status: string;
  payment_status: string;
  total_amount: number;
  booking_date: string;
  notes: string;
  court_slots: {
    date: string;
    start_time: string;
    end_time: string;
    courts: {
      name: string;
      club_users: {
        club_name: string;
      };
    };
  };
}

export const MyBookings: React.FC = () => {
  const { userProfile } = useAuthStore();
  const { formatPrice } = useCurrency();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected' | 'completed'>('all');

  useEffect(() => {
    if (userProfile) {
      fetchBookings();
    }
  }, [userProfile]);

  const fetchBookings = async () => {
    if (!userProfile) return;

    setLoading(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const authUserId = authData?.user?.id;

      if (!authUserId) {
        setLoading(false);
        return;
      }

      const { data: playerRow } = await supabase
        .from('player_users')
        .select('id')
        .eq('user_id', authUserId)
        .maybeSingle();

      if (!playerRow?.id) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('bookings')
        .select(`
          id,
          status,
          payment_status,
          total_amount,
          booking_date,
          notes,
          court_slots (
            date,
            start_time,
            end_time,
            courts (
              name,
              club_users (club_name)
            )
          )
        `)
        .eq('player_id', playerRow.id)
        .order('booking_date', { ascending: false });

      if (error) throw error;
      setBookings(data || []);
    } catch (error) {
      console.error('Error fetching bookings:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredBookings = filter === 'all'
    ? bookings
    : bookings.filter(b => b.status === filter);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
        return 'bg-emerald-100 text-emerald-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'rejected':
        return 'bg-red-100 text-red-800';
      case 'completed':
        return 'bg-blue-100 text-blue-800';
      case 'cancelled':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getPaymentStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'refunded':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">My Bookings</h1>
          <p className="text-gray-600 mt-1">View and manage your court bookings</p>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {['all', 'pending', 'approved', 'rejected', 'completed'].map((status) => (
          <button
            key={status}
            onClick={() => setFilter(status as any)}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filter === status
                ? 'bg-emerald-600 text-white'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
        </div>
      ) : filteredBookings.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No bookings found</h3>
          <p className="text-gray-600">
            {filter === 'all'
              ? "You haven't made any bookings yet. Book a court to get started!"
              : `No ${filter} bookings found.`}
          </p>
        </div>
      ) : (
        <div className="grid gap-6">
          {filteredBookings.map((booking) => (
            <div
              key={booking.id}
              className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow"
            >
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold text-gray-900 mb-1">
                      {booking.court_slots?.courts?.name || 'Court'}
                    </h3>
                    <p className="text-gray-600 flex items-center">
                      <MapPin className="h-4 w-4 mr-1" />
                      {booking.court_slots?.courts?.club_users?.club_name || 'Club'}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className={`px-3 py-1 text-sm font-medium rounded-full ${getStatusColor(booking.status)}`}>
                      {booking.status}
                    </span>
                    <span className={`px-3 py-1 text-sm font-medium rounded-full ${getPaymentStatusColor(booking.payment_status)}`}>
                      {booking.payment_status}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div className="flex items-center text-gray-700">
                    <Calendar className="h-5 w-5 text-emerald-600 mr-2" />
                    <div>
                      <p className="text-sm text-gray-500">Date</p>
                      <p className="font-medium">{booking.court_slots?.date || 'N/A'}</p>
                    </div>
                  </div>

                  <div className="flex items-center text-gray-700">
                    <Clock className="h-5 w-5 text-emerald-600 mr-2" />
                    <div>
                      <p className="text-sm text-gray-500">Time</p>
                      <p className="font-medium">
                        {booking.court_slots?.start_time} - {booking.court_slots?.end_time}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center text-gray-700">
                    <DollarSign className="h-5 w-5 text-emerald-600 mr-2" />
                    <div>
                      <p className="text-sm text-gray-500">Amount</p>
                      <p className="font-medium">{formatPrice(booking.total_amount)}</p>
                    </div>
                  </div>
                </div>

                {booking.notes && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-sm text-gray-500 mb-1">Notes</p>
                    <p className="text-gray-700">{booking.notes}</p>
                  </div>
                )}

                <div className="mt-4 pt-4 border-t border-gray-200">
                  <p className="text-xs text-gray-500">
                    Booked on {new Date(booking.booking_date).toLocaleDateString()} at{' '}
                    {new Date(booking.booking_date).toLocaleTimeString()}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
