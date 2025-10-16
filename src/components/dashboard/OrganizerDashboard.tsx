import React, { useState, useEffect } from 'react';
import { Calendar, Trophy, MapPin, Users, DollarSign, Clock, Plus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';

export const OrganizerDashboard: React.FC = () => {
  const { userProfile } = useAuthStore();
  const [stats, setStats] = useState({
    activeTournaments: 0,
    totalParticipants: 0,
    upcomingEvents: 0,
    totalRevenue: 0,
  });

  const [recentTournaments, setRecentTournaments] = useState<any[]>([]);

  useEffect(() => {
    if (userProfile) {
      fetchDashboardData();
    }
  }, [userProfile]);

  const fetchDashboardData = async () => {
    if (!userProfile) return;

    // Fetch dashboard stats using stored procedure
    const { data: statsData, error: statsError } = await supabase
      .rpc('get_organizer_dashboard_stats', { p_organizer_id: userProfile.id });

    if (statsData && statsData.length > 0) {
      const stat = statsData[0];
      setStats({
        activeTournaments: stat.active_tournaments || 0,
        totalParticipants: stat.total_participants || 0,
        upcomingEvents: stat.upcoming_events || 0,
        totalRevenue: stat.total_revenue || 0,
      });
    }

    // Fetch tournaments organized by this organizer for display
    const { data: tournamentsData } = await supabase
      .from('tournaments')
      .select(`
        *,
        tournament_participants (
          id,
          player_users (full_name)
        )
      `)
      .eq('organizer_id', userProfile.id)
      .eq('hosted_by', 'organizer')
      .order('created_at', { ascending: false })
      .limit(5);

    if (tournamentsData) {
      setRecentTournaments(tournamentsData);
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
        <h1 className="text-2xl sm:text-3xl font-bold mb-2">Organizer Control Center</h1>
        <p className="text-secondary-100 text-sm sm:text-base">Manage your tournaments and events with ease</p>
        <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
          <div className="bg-primary-500/40 rounded-lg px-3 py-1 inline-block">
            <span className="text-sm font-medium">Welcome, {userProfile?.name}</span>
          </div>
          <div className="bg-secondary-500/30 rounded-lg px-3 py-1 inline-block">
            <span className="text-sm">Organizer Account</span>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <StatCard
          icon={Trophy}
          title="Active Tournaments"
          value={stats.activeTournaments}
          color="bg-primary-500"
        />
        <StatCard
          icon={Users}
          title="Total Participants"
          value={stats.totalParticipants}
          color="bg-secondary-500"
        />
        <StatCard
          icon={Clock}
          title="Upcoming Events"
          value={stats.upcomingEvents}
          color="bg-accent-500"
        />
        <StatCard
          icon={DollarSign}
          title="Total Revenue"
          value={`$${stats.totalRevenue}`}
          color="bg-secondary-600"
        />
      </div>

      {/* Management Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
        {/* Recent Tournaments */}
        <div className="bg-background rounded-xl shadow-sm border border-background-subtle">
          <div className="p-4 sm:p-6 border-b border-background-subtle">
            <h2 className="text-lg sm:text-xl font-semibold text-text-primary flex items-center">
              <Trophy className="h-5 w-5 text-primary-500 mr-2" />
              Recent Tournaments
            </h2>
          </div>
          <div className="p-4 sm:p-6">
            {recentTournaments.length > 0 ? (
              <div className="space-y-3 sm:space-y-4">
                {recentTournaments.map((tournament) => (
                  <div key={tournament.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 bg-background-subtle rounded-lg">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-text-primary truncate">{tournament.name}</p>
                      <p className="text-sm text-text-secondary truncate">{tournament.location}</p>
                      <p className="text-xs sm:text-sm text-text-secondary">
                        {new Date(tournament.start_date).toLocaleDateString()} - {new Date(tournament.end_date).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center justify-between sm:flex-col sm:items-end gap-2">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full whitespace-nowrap ${
                        tournament.status === 'registration_open' ? 'bg-secondary-100 text-secondary-700' :
                        tournament.status === 'ongoing' ? 'bg-accent-100 text-accent-700' :
                        tournament.status === 'completed' ? 'bg-primary-50 text-primary-700' :
                        'bg-background-subtle text-text-secondary'
                      }`}>
                        {tournament.status.replace('_', ' ')}
                      </span>
                      <p className="text-sm font-medium text-text-primary">
                        {tournament.tournament_participants?.length || 0} participants
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <Trophy className="h-12 w-12 text-text-secondary mx-auto mb-4" />
                <p className="text-text-secondary mb-4 text-sm sm:text-base">No tournaments created yet</p>
                <button className="px-4 py-2 bg-primary-500 text-white text-sm sm:text-base rounded-lg hover:bg-primary-600 transition-colors">
                  Create Your First Tournament
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-background rounded-xl shadow-sm border border-background-subtle">
          <div className="p-4 sm:p-6 border-b border-background-subtle">
            <h2 className="text-lg sm:text-xl font-semibold text-text-primary flex items-center">
              <MapPin className="h-5 w-5 text-secondary-500 mr-2" />
              Quick Actions
            </h2>
          </div>
          <div className="p-4 sm:p-6">
            <div className="space-y-3 sm:space-y-4">
              <button className="w-full flex items-center justify-between p-3 sm:p-4 bg-gradient-to-r from-primary-50 via-primary-100 to-secondary-50 rounded-lg border border-primary-200 hover:from-primary-100 hover:to-secondary-100 transition-colors">
                <div className="flex items-center">
                  <Plus className="h-4 w-4 sm:h-5 sm:w-5 text-primary-500 mr-2 sm:mr-3" />
                  <span className="text-sm sm:text-base font-medium text-text-primary">Create New Tournament</span>
                </div>
                <span className="text-primary-500">→</span>
              </button>

              <button className="w-full flex items-center justify-between p-3 sm:p-4 bg-gradient-to-r from-secondary-50 via-background-tint to-highlight rounded-lg border border-secondary-200 hover:from-secondary-100 hover:to-highlight transition-colors">
                <div className="flex items-center">
                  <Calendar className="h-4 w-4 sm:h-5 sm:w-5 text-secondary-500 mr-2 sm:mr-3" />
                  <span className="text-sm sm:text-base font-medium text-text-primary">Rent Court Space</span>
                </div>
                <span className="text-secondary-500">→</span>
              </button>

              <button className="w-full flex items-center justify-between p-3 sm:p-4 bg-gradient-to-r from-accent-50 via-primary-50 to-secondary-50 rounded-lg border border-accent-200 hover:from-accent-100 hover:to-secondary-100 transition-colors">
                <div className="flex items-center">
                  <Users className="h-4 w-4 sm:h-5 sm:w-5 text-accent-500 mr-2 sm:mr-3" />
                  <span className="text-sm sm:text-base font-medium text-text-primary">Manage Participants</span>
                </div>
                <span className="text-accent-500">→</span>
              </button>

              <div className="mt-4 sm:mt-6 p-3 sm:p-4 bg-accent-50 border border-accent-200 rounded-lg">
                <h3 className="text-sm sm:text-base font-medium text-accent-700 mb-2">Organizer Features</h3>
                <ul className="text-xs sm:text-sm text-accent-600 space-y-1">
                  <li>• Create and manage tournaments</li>
                  <li>• Rent court space from clubs</li>
                  <li>• Track participant registrations</li>
                  <li>• Manage tournament brackets</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};