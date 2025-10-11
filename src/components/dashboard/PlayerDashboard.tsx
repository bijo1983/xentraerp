import React, { useState, useEffect } from 'react';
import { Calendar, Trophy, MapPin, Clock, Star } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';

export const PlayerDashboard: React.FC = () => {
  const { userProfile } = useAuthStore();
  const [stats, setStats] = useState({
    upcomingBookings: 0,
    completedBookings: 0,
    activeTournaments: 0,
    totalSpent: 0,
  });

  const [recentBookings, setRecentBookings] = useState<any[]>([]);
  const [upcomingTournaments, setUpcomingTournaments] = useState<any[]>([]);

  useEffect(() => {
    if (userProfile) {
      fetchDashboardData();
    }
  }, [userProfile]);

  const fetchDashboardData = async () => {
    if (!userProfile) return;

    // Fetch dashboard stats using stored procedure
    const { data: statsData, error: statsError } = await supabase
      .rpc('get_player_dashboard_stats', { p_player_id: userProfile.id });

    console.log('Player Dashboard - Stats Data:', statsData);
    console.log('Player Dashboard - Stats Error:', statsError);
    console.log('Player Dashboard - User Profile ID:', userProfile.id);

    if (statsData && statsData.length > 0) {
      const stat = statsData[0];
      setStats({
        upcomingBookings: stat.upcoming_bookings || 0,
        completedBookings: stat.completed_bookings || 0,
        activeTournaments: stat.active_tournaments || 0,
        totalSpent: stat.total_spent || 0,
      });
    }

    // Fetch recent bookings using stored procedure
    const { data: recentBookingsData, error: bookingsError } = await supabase
      .rpc('get_player_recent_bookings', { p_player_id: userProfile.id });

    if (recentBookingsData) {
      setRecentBookings(recentBookingsData);
    }

    // Fetch tournament participation
    const { data: tournaments } = await supabase
      .from('tournament_participants')
      .select(`
        tournaments (
          id,
          name,
          start_date,
          end_date,
          location,
          status
        )
      `)
      .eq('player_id', userProfile.id)
      .limit(3);

    if (tournaments) {
      setUpcomingTournaments(tournaments.map(t => t.tournaments).filter(Boolean));
    }
  };

  const StatCard: React.FC<{ icon: React.ElementType; title: string; value: string | number; color: string }> =
    ({ icon: Icon, title, value, color }) => (
      <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
        <div className="flex flex-col sm:flex-row items-start sm:items-center sm:justify-between gap-2">
          <div className="flex-1">
            <p className="text-xs sm:text-sm font-medium text-gray-600">{title}</p>
            <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">{value}</p>
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
      <div className="bg-gradient-to-r from-emerald-600 to-blue-600 rounded-xl p-6 sm:p-8 text-white">
        <h1 className="text-2xl sm:text-3xl font-bold mb-2">Welcome back, {userProfile?.name}!</h1>
        <p className="text-emerald-100 text-sm sm:text-base">Ready for your next game? Let's get you on the court!</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <StatCard
          icon={Calendar}
          title="Upcoming Bookings"
          value={stats.upcomingBookings}
          color="bg-emerald-500"
        />
        <StatCard
          icon={Trophy}
          title="Active Tournaments"
          value={stats.activeTournaments}
          color="bg-blue-500"
        />
        <StatCard
          icon={Clock}
          title="Completed Bookings"
          value={stats.completedBookings}
          color="bg-orange-500"
        />
        <StatCard
          icon={Star}
          title="Total Spent"
          value={`$${stats.totalSpent}`}
          color="bg-teal-500"
        />
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
        {/* Recent Bookings */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="p-4 sm:p-6 border-b border-gray-200">
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900 flex items-center">
              <MapPin className="h-5 w-5 text-emerald-600 mr-2" />
              Recent Bookings
            </h2>
          </div>
          <div className="p-4 sm:p-6">
            {recentBookings.length > 0 ? (
              <div className="space-y-3 sm:space-y-4">
                {recentBookings.map((booking) => (
                  <div key={booking.booking_id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 bg-gray-50 rounded-lg">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">
                        {booking.court_name}
                      </p>
                      <p className="text-sm text-gray-600 truncate">
                        {booking.club_name}
                      </p>
                      <p className="text-xs sm:text-sm text-gray-500">
                        {booking.slot_date} at {booking.slot_start_time}
                      </p>
                    </div>
                    <div className="flex items-center justify-between sm:flex-col sm:items-end gap-2">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full whitespace-nowrap ${
                        booking.booking_status === 'approved' ? 'bg-emerald-100 text-emerald-800' :
                        booking.booking_status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                        booking.booking_status === 'rejected' ? 'bg-red-100 text-red-800' :
                        booking.booking_status === 'completed' ? 'bg-blue-100 text-blue-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {booking.booking_status}
                      </span>
                      {booking.total_amount && (
                        <p className="text-sm font-medium text-gray-900">
                          ${booking.total_amount}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-8 text-sm sm:text-base">No bookings yet</p>
            )}
          </div>
        </div>

        {/* Upcoming Tournaments */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="p-4 sm:p-6 border-b border-gray-200">
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900 flex items-center">
              <Trophy className="h-5 w-5 text-blue-600 mr-2" />
              Upcoming Tournaments
            </h2>
          </div>
          <div className="p-4 sm:p-6">
            {upcomingTournaments.length > 0 ? (
              <div className="space-y-3 sm:space-y-4">
                {upcomingTournaments.map((tournament) => (
                  <div key={tournament.id} className="p-4 bg-gray-50 rounded-lg">
                    <h3 className="font-medium text-gray-900 truncate">{tournament.name}</h3>
                    <p className="text-sm text-gray-600 mt-1 truncate">{tournament.location}</p>
                    <div className="flex items-center justify-between mt-2 gap-2">
                      <p className="text-xs sm:text-sm text-gray-500 truncate">
                        {new Date(tournament.start_date).toLocaleDateString()}
                      </p>
                      <span className={`px-2 py-1 text-xs font-medium rounded-full whitespace-nowrap ${
                        tournament.status === 'registration_open' ? 'bg-green-100 text-green-800' :
                        tournament.status === 'ongoing' ? 'bg-orange-100 text-orange-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {tournament.status.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-8 text-sm sm:text-base">No tournaments joined yet</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};