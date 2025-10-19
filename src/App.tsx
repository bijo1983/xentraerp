// src/App.tsx
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';

import { AuthForm } from './components/auth/AuthForm';
import Register from './components/auth/Register';
import { Navbar } from './components/layout/Navbar';
import { Sidebar } from './components/layout/Sidebar';
import { Footer } from './components/layout/Footer';
import { PlayerDashboard } from './components/dashboard/PlayerDashboard';
import { ClubDashboard } from './components/dashboard/ClubDashboard';
import { OrganizerDashboard } from './components/dashboard/OrganizerDashboard';
import { GroupDashboard } from './components/dashboard/GroupDashboard';
import { BookCourt } from './components/courts/BookCourt';
// ❌ Removed: QueryProvider (belongs in main.tsx)
import { ManageCourts } from './components/courts/ManageCourts';
import { ManageSlots } from './components/courts/ManageSlots';
import { ManageBookings } from './components/bookings/ManageBookings';
import { ViewBookings } from './components/bookings/ViewBookings';
import { MyBookings } from './components/bookings/MyBookings';
import { ApproveRequests } from './components/bookings/ApproveRequests';
import { TournamentsList } from './components/tournaments/TournamentsList';
import { CreateTournament } from './components/tournaments/CreateTournament';
import TournamentDetails from './components/tournaments/tournamentdetails';
import EditTournament from './components/tournaments/EditTournament';
import { ProfileSettings } from './components/profile/ProfileSettings';
import { FindClubs } from './components/clubs/FindClubs';
import { Analytics } from './components/analytics/Analytics';
import { SupabaseVerification } from './components/debug/SupabaseVerification';
import { SupabaseSetup } from './components/debug/SupabaseSetup';
import { DatabaseConnection } from './components/debug/DatabaseConnection';
import { useAuthStore } from './store/authStore';
import { Login } from './components/auth/Login';
import { AdminConsole } from './components/admin/AdminConsole';

const VIEW_TO_PATH: Record<string, string> = {
  dashboard: '/',
  'book-court': '/book-court',
  'my-bookings': '/my-bookings',
  'approve-requests': '/approve-requests',
  courts: '/courts',
  'manage-slots': '/manage-slots',
  'manage-bookings': '/manage-bookings',
  'view-bookings': '/view-bookings',
  tournaments: '/tournaments',
  'create-tournament': '/create-tournament',
  profile: '/profile',
  'find-clubs': '/find-clubs',
  analytics: '/analytics',
  'admin-console': '/admin-console',
};

const PATH_TO_VIEW: Record<string, string> = Object.entries(VIEW_TO_PATH).reduce(
  (acc, [view, path]) => {
    const key = path.replace(/^\/+/, '');
    acc[key] = view;
    return acc;
  },
  {
    '': 'dashboard',
    dashboard: 'dashboard',
  } as Record<string, string>
);

const getViewFromPath = (pathname: string): string => {
  const segment = pathname.replace(/^\/+/, '').split('/')[0];
  return PATH_TO_VIEW[segment] ?? 'dashboard';
};

const getPathForView = (view: string): string => VIEW_TO_PATH[view] ?? '/';

function AppContent() {
  const { user, userProfile, loading } = useAuthStore();

  const location = useLocation();
  const navigate = useNavigate();

  const [activeView, setActiveView] = React.useState(() => getViewFromPath(location.pathname));
  const [mountedViews, setMountedViews] = React.useState<string[]>(() => [getViewFromPath(location.pathname)]);
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);

  const Spinner = (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-background-tint to-secondary-50 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto mb-4"></div>
        <p className="text-text-secondary">🔄 Loading Badminton Booking...</p>
      </div>
    </div>
  );

  React.useEffect(() => {
    console.log('🔎 AppContent state:', { user, userProfile, loading });
  }, [user, userProfile, loading]);

  React.useEffect(() => {
    const viewFromLocation = getViewFromPath(location.pathname);
    if (viewFromLocation !== activeView) {
      setActiveView(viewFromLocation);
    }
  }, [location.pathname, activeView]);

  React.useEffect(() => {
    setMountedViews((prev) => {
      if (prev.includes(activeView)) {
        return prev;
      }
      return [...prev, activeView];
    });
  }, [activeView]);

  const handleViewChange = React.useCallback(
    (view: string) => {
      setActiveView(view);
      const targetPath = getPathForView(view);
      if (location.pathname !== targetPath) {
        navigate(targetPath, { replace: true });
      }
    },
    [navigate, location.pathname]
  );

  if (window.location.search.includes('debug=supabase')) {
    return <SupabaseVerification />;
  }

  // Supabase not configured
  if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
    return <SupabaseSetup />;
  }

  // While store is booting
  if (loading) {
    return Spinner;
  }

  if (!user) return <Navigate to="/login" replace />;

  // User exists but profile not ready yet
  if (user && !userProfile) {
    return (
      <div className="p-6 text-center text-text-secondary">
        ⏳ Setting up your profile…
        <br />
        If this takes longer than expected, please refresh.
        <br />
        <pre className="text-left mt-4 bg-background-subtle p-4 rounded text-sm text-text-primary">
          {JSON.stringify({ id: user.id, email: (user as any)?.email }, null, 2)}
        </pre>
      </div>
    );
  }

  const renderView = (view: string) => {
    switch (view) {
      case 'dashboard': {
        switch (userProfile?.type) {
          case 'Player':
            return <PlayerDashboard />;
          case 'Club':
            return <ClubDashboard />;
          case 'Organizer':
            return <OrganizerDashboard />;
          case 'Group':
            return <GroupDashboard />;
          default:
            return <PlayerDashboard />;
        }
      }
      case 'book-court':
        return <BookCourt />;
      case 'my-bookings':
        return <MyBookings />;
      case 'approve-requests':
        return <ApproveRequests />;
      case 'courts':
        return <ManageCourts />;
      case 'manage-slots':
        return <ManageSlots />;
      case 'manage-bookings':
        return <ManageBookings />;
      case 'view-bookings':
        return <ViewBookings />;
      case 'tournaments':
        return <TournamentsList />;
      case 'create-tournament':
        return <CreateTournament />;
      case 'profile':
        return <ProfileSettings />;
      case 'find-clubs':
        return <FindClubs />;
      case 'analytics':
        return <Analytics />;
      case 'admin-console':
        return <AdminConsole />;
      default:
        return (
          <div className="flex items-center justify-center h-96">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-text-primary mb-2">Coming Soon</h2>
              <p className="text-text-secondary">This feature is under development.</p>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-background-subtle flex flex-col">
      <Navbar onMenuClick={() => setIsSidebarOpen(true)} />
      <div className="flex flex-1">
        <Sidebar
          activeView={activeView}
          onViewChange={handleViewChange}
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
        />
        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto">
            {mountedViews.map((view) => (
              <div key={view} style={{ display: view === activeView ? 'block' : 'none' }}>
                {renderView(view)}
              </div>
            ))}
          </div>
        </main>
      </div>
      <Footer />
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Login & Auth */}
        <Route path="/login" element={<Login />} />

        {/* Debug & Connection */}
        <Route path="/db-connection" element={<DatabaseConnection />} />

        {/* Tournament Routes */}
        <Route path="/tournaments" element={<TournamentsList />} />
        <Route path="/tournaments/:id" element={<TournamentDetails />} />
        <Route path="/tournaments/edit/:id" element={<EditTournament />} />

        {/* Main entry point */}
        <Route path="/*" element={<AppContent />} />

        {/* Register */}
        <Route path="/register" element={<Register />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
