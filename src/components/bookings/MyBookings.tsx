import React, { useState, useEffect } from 'react';
import { Calendar, MapPin, Clock, DollarSign, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { useCurrency } from '../../hooks/useCurrency';
import { GroupBookingPage } from './GroupBookingPage';

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

  if (userProfile?.type === 'Group') {
    return <GroupBookingPage showPlanner={false} />;
  }
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
        return 'bg-primary-50 text-primary-700';
      case 'pending':
        return 'bg-accent-100 text-accent-700';
      case 'rejected':
        return 'bg-red-100 text-red-800';
      case 'completed':
        return 'bg-secondary-100 text-secondary-700';
      case 'cancelled':
        return 'bg-background-subtle text-text-secondary';
      default:
        return 'bg-background-subtle text-text-secondary';
    }
  };

  const getPaymentStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return 'bg-secondary-100 text-secondary-700';
      case 'pending':
        return 'bg-accent-100 text-accent-700';
      case 'refunded':
        return 'bg-primary-50 text-primary-700';
      default:
        return 'bg-background-subtle text-text-secondary';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-text-primary">My Bookings</h1>
          <p className="text-text-secondary mt-1">View and manage your court bookings</p>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {['all', 'pending', 'approved', 'rejected', 'completed'].map((status) => (
          <button
            key={status}
            onClick={() => setFilter(status as any)}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filter === status
                ? 'bg-primary-500 text-white'
                : 'bg-background text-text-primary border border-background-subtle hover:bg-primary-50 hover:text-primary-600'
            }`}
          >
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
        </div>
      ) : filteredBookings.length === 0 ? (
        <div className="bg-background rounded-xl shadow-sm border border-background-subtle p-12 text-center">
          <AlertCircle className="h-12 w-12 text-text-secondary mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-text-primary mb-2">No bookings found</h3>
          <p className="text-text-secondary">
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
              className="bg-background rounded-xl shadow-sm border border-background-subtle overflow-hidden hover:shadow-md transition-shadow"
            >
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold text-text-primary mb-1">
                      {booking.court_slots?.courts?.name || 'Court'}
                    </h3>
                    <p className="text-text-secondary flex items-center">
                      <MapPin className="h-4 w-4 text-primary-500 mr-1" />
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
                  <div className="flex items-center text-text-primary">
                    <Calendar className="h-5 w-5 text-primary-500 mr-2" />
                    <div>
                      <p className="text-sm text-text-secondary">Date</p>
                      <p className="font-medium">{booking.court_slots?.date || 'N/A'}</p>
                    </div>
                  </div>

                  <div className="flex items-center text-text-primary">
                    <Clock className="h-5 w-5 text-primary-500 mr-2" />
                    <div>
                      <p className="text-sm text-text-secondary">Time</p>
                      <p className="font-medium">
                        {booking.court_slots?.start_time} - {booking.court_slots?.end_time}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center text-text-primary">
                    <DollarSign className="h-5 w-5 text-primary-500 mr-2" />
                    <div>
                      <p className="text-sm text-text-secondary">Amount</p>
                      <p className="font-medium">{formatPrice(booking.total_amount)}</p>
                    </div>
                  </div>
                </div>

                {booking.notes && (
                  <div className="bg-background-subtle rounded-lg p-4">
                    <p className="text-sm text-text-secondary mb-1">Notes</p>
                    <p className="text-text-primary">{booking.notes}</p>
                  </div>
                )}

                <div className="mt-4 pt-4 border-t border-background-subtle">
                  <p className="text-xs text-text-secondary">
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
