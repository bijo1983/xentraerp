import React, { useState, useEffect } from 'react';
import { Calendar, Clock, User, DollarSign, CheckCircle, XCircle, AlertCircle, MapPin } from 'lucide-react';
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

export const ApproveRequests: React.FC = () => {
  const { userProfile } = useAuthStore();
  const { formatPrice } = useCurrency();
  const [pendingRequests, setPendingRequests] = useState<BookingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    if (userProfile) {
      fetchPendingRequests();
    }
  }, [userProfile]);

  const fetchPendingRequests = async () => {
    if (!userProfile) return;

    setLoading(true);
    try {
      console.log('ApproveRequests - Fetching pending bookings...');
      console.log('ApproveRequests - Current user:', userProfile);

      const { data, error } = await supabase.rpc('get_club_pending_bookings');

      console.log('ApproveRequests - RPC Response:', { data, error });

      if (error) throw error;
      setPendingRequests(data || []);
    } catch (error) {
      console.error('Error fetching pending requests:', error);
    } finally {
      setLoading(false);
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
      fetchPendingRequests();
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
      fetchPendingRequests();
    } catch (error) {
      console.error('Error rejecting booking:', error);
      alert('Error rejecting booking. Please try again.');
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-text-primary">Approve Booking Requests</h1>
          <p className="text-text-secondary mt-1">Review and approve pending court bookings</p>
        </div>
        {pendingRequests.length > 0 && (
          <div className="flex items-center gap-2 bg-accent-50 border border-accent-200 rounded-lg px-4 py-2">
            <AlertCircle className="h-5 w-5 text-accent-500" />
            <span className="font-semibold text-accent-700">
              {pendingRequests.length} Pending {pendingRequests.length === 1 ? 'Request' : 'Requests'}
            </span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
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
                      className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
