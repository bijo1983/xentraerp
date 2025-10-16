import React, { useState, useEffect } from 'react';
import { MapPin, Calendar, Trophy, DollarSign, TrendingUp, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';

export const ClubDashboard: React.FC = () => {
  const { userProfile } = useAuthStore();
  const [stats, setStats] = useState({
    totalCourts: 0,
    totalBookings: 0,
    activeTournaments: 0,
    monthlyRevenue: 0,
    bookingRate: 0,
  });

  const [recentBookings, setRecentBookings] = useState<any[]>([]);
  const [courts, setCourts] = useState<any[]>([]);
  type LifecycleState = {
    approval_status: 'pending' | 'approved' | 'rejected';
    payment_status: 'unpaid' | 'paid' | 'overdue';
    is_visible: boolean;
  };

  const [lifecycle, setLifecycle] = useState<LifecycleState | null>(null);

  useEffect(() => {
    if (userProfile) {
      fetchDashboardData();
    }
  }, [userProfile]);

  const fetchDashboardData = async () => {
    if (!userProfile) return;

    const lifecyclePromise = supabase
      .from('club_users')
      .select('approval_status, payment_status, is_visible')
      .eq('id', userProfile.id)
      .maybeSingle();

    // Fetch dashboard stats using stored procedure
    const { data: statsData, error: statsError } = await supabase
      .rpc('get_club_dashboard_stats', { p_club_id: userProfile.id });

    console.log('Club Dashboard - Stats Data:', statsData);
    console.log('Club Dashboard - Stats Error:', statsError);
    console.log('Club Dashboard - User Profile ID:', userProfile.id);

    if (statsData && statsData.length > 0) {
      const stat = statsData[0];
      setStats({
        totalCourts: stat.total_courts || 0,
        totalBookings: stat.total_bookings || 0,
        activeTournaments: stat.active_tournaments || 0,
        monthlyRevenue: stat.monthly_revenue || 0,
        bookingRate: stat.booking_rate || 0,
      });
    }

    const { data: lifecycleData, error: lifecycleError } = await lifecyclePromise;
    if (lifecycleError) {
      console.error('Club lifecycle fetch error:', lifecycleError);
    } else if (lifecycleData) {
      setLifecycle(lifecycleData as LifecycleState);
    }

    // Fetch recent bookings using stored procedure
    const { data: recentBookingsData, error: bookingsError } = await supabase
      .rpc('get_club_recent_bookings', { p_club_id: userProfile.id });

    if (recentBookingsData) {
      setRecentBookings(recentBookingsData);
    }

    // Fetch courts for display
    const { data: courtsData } = await supabase
      .from('courts')
      .select('*')
      .eq('club_id', userProfile.id);

    if (courtsData) {
      setCourts(courtsData);
    }
  };

  const StatCard: React.FC<{ icon: React.ElementType; title: string; value: string | number; color: string }> =
    ({ icon: Icon, title, value, color }) => (
      <div className="bg-background p-4 sm:p-6 rounded-xl shadow-sm border border-background-subtle hover:shadow-md transition-shadow">
        <div className="flex flex-col sm:flex-row items-start sm:items-center sm:justify-between gap-2">
          <div className="flex-1">
            <p className="text-xs sm:text-sm font-medium text-text-secondary">{title}</p>
            <p className="text-xl sm:text-2xl font-bold text-text-primary mt-1">{value}</p>
          </div>
          <div className={`p-2 sm:p-3 rounded-lg ${color} flex items-center justify-center flex-shrink-0`}>
            <Icon className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
          </div>
        </div>
      </div>
    );

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Welcome Section */}
      <div className="bg-gradient-to-r from-primary-500 via-primary-400 to-secondary-500 rounded-xl p-6 sm:p-8 text-white">
        <h1 className="text-2xl sm:text-3xl font-bold mb-2">Club Management Hub</h1>
        <p className="text-secondary-100 text-sm sm:text-base">Manage your courts, bookings, and tournaments all in one place</p>
      </div>

      {lifecycle && (
        (() => {
          const alerts: { message: string; tone: 'warning' | 'danger' }[] = [];

          if (lifecycle.approval_status === 'pending') {
            alerts.push({
              message: 'Your club profile is awaiting administrator approval. Players cannot discover your club until it is approved.',
              tone: 'warning',
            });
          }

          if (lifecycle.approval_status === 'rejected') {
            alerts.push({
              message: 'Your club registration was rejected. Please contact support to resolve the issue.',
              tone: 'danger',
            });
          }

          if (lifecycle.approval_status === 'approved' && !lifecycle.is_visible) {
            alerts.push({
              message: 'Your club is currently hidden from public listings. Reach out to the administrator to publish it.',
              tone: 'warning',
            });
          }

          if (lifecycle.payment_status !== 'paid') {
            alerts.push({
              message: `Your subscription payment is marked as ${lifecycle.payment_status}. Please coordinate with the administrator to update your payment status.`,
              tone: lifecycle.payment_status === 'overdue' ? 'danger' : 'warning',
            });
          }

          if (alerts.length === 0) return null;

          const severity = alerts.some(alert => alert.tone === 'danger') ? 'danger' : 'warning';
          const wrapperClasses =
            severity === 'danger'
              ? 'bg-rose-50 border-rose-200 text-rose-700'
              : 'bg-amber-50 border-amber-200 text-amber-800';

          return (
            <div className={`border rounded-xl p-4 sm:p-5 shadow-sm ${wrapperClasses}`}>
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 mt-1 flex-shrink-0" />
                <div className="space-y-2 text-sm">
                  {alerts.map((alert, index) => (
                    <p key={index}>{alert.message}</p>
                  ))}
                </div>
              </div>
            </div>
          );
        })()
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 sm:gap-6">
        <StatCard
          icon={MapPin}
          title="Total Courts"
          value={stats.totalCourts}
          color="bg-primary-500"
        />
        <StatCard
          icon={Calendar}
          title="Total Bookings"
          value={stats.totalBookings}
          color="bg-secondary-500"
        />
        <StatCard
          icon={Trophy}
          title="Active Tournaments"
          value={stats.activeTournaments}
          color="bg-accent-500"
        />
        <StatCard
          icon={DollarSign}
          title="Monthly Revenue"
          value={`$${stats.monthlyRevenue}`}
          color="bg-primary-600"
        />
        <StatCard
          icon={TrendingUp}
          title="Booking Rate"
          value={`${stats.bookingRate}/court`}
          color="bg-secondary-600"
        />
      </div>

      {/* Management Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
        {/* Recent Bookings */}
        <div className="bg-background rounded-xl shadow-sm border border-background-subtle">
          <div className="p-4 sm:p-6 border-b border-background-subtle">
            <h2 className="text-lg sm:text-xl font-semibold text-text-primary flex items-center">
              <Calendar className="h-5 w-5 text-secondary-500 mr-2" />
              Recent Bookings
            </h2>
          </div>
          <div className="p-4 sm:p-6">
            {recentBookings.length > 0 ? (
              <div className="space-y-3 sm:space-y-4">
                {recentBookings.map((booking) => (
                  <div key={booking.booking_id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 bg-background-subtle rounded-lg">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-text-primary truncate">
                        {booking.player_name}
                      </p>
                      <p className="text-sm text-text-secondary truncate">
                        {booking.court_name}
                      </p>
                      <p className="text-xs sm:text-sm text-text-secondary">
                        {booking.slot_date} at {booking.slot_start_time}
                      </p>
                    </div>
                    <div className="flex items-center justify-between sm:flex-col sm:items-end gap-2">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full whitespace-nowrap ${
                        booking.booking_status === 'approved' ? 'bg-primary-50 text-primary-700' :
                        booking.booking_status === 'completed' ? 'bg-secondary-100 text-secondary-700' :
                        booking.booking_status === 'pending' ? 'bg-accent-100 text-accent-700' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {booking.booking_status}
                      </span>
                      {booking.total_amount && (
                        <p className="text-sm font-medium text-text-primary">
                          ${booking.total_amount}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-text-secondary text-center py-8 text-sm sm:text-base">No bookings yet</p>
            )}
          </div>
        </div>

        {/* Courts Overview */}
        <div className="bg-background rounded-xl shadow-sm border border-background-subtle">
          <div className="p-4 sm:p-6 border-b border-background-subtle">
            <h2 className="text-lg sm:text-xl font-semibold text-text-primary flex items-center">
              <MapPin className="h-5 w-5 text-primary-500 mr-2" />
              Courts Overview
            </h2>
          </div>
          <div className="p-4 sm:p-6">
            {courts.length > 0 ? (
              <div className="space-y-3 sm:space-y-4">
                {courts.map((court) => (
                  <div key={court.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 bg-background-subtle rounded-lg">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-text-primary truncate">{court.name}</p>
                      <p className="text-sm text-text-secondary">{court.surface_type} Surface</p>
                      {court.amenities && court.amenities.length > 0 && (
                        <p className="text-xs sm:text-sm text-text-secondary truncate">
                          {court.amenities.join(', ')}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center justify-between sm:flex-col sm:items-end gap-2">
                      <p className="text-base sm:text-lg font-semibold text-text-primary">
                        ${court.hourly_rate}/hr
                      </p>
                      <span className={`px-2 py-1 text-xs font-medium rounded-full whitespace-nowrap ${
                        court.is_available ? 'bg-secondary-100 text-secondary-700' : 'bg-red-100 text-red-800'
                      }`}>
                        {court.is_available ? 'Available' : 'Unavailable'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-text-secondary mb-4 text-sm sm:text-base">No courts added yet</p>
                <button className="px-4 py-2 bg-primary-500 text-white text-sm sm:text-base rounded-lg hover:bg-primary-600 transition-colors">
                  Add Your First Court
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};