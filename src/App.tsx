// src/App.tsx
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate, Outlet } from 'react-router-dom';

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
import ManageDropdownOptions from './components/tournaments/ManageDropdownOptions';
import { RequireRole } from './components/auth/RequireRole';
import HomeRedirect from './HomeRedirect';


const VIEW_TO_PATH: Record<string, string> = {
  dashboard: '/dashboard',
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
    'admin/manage-dropdowns': 'admin-console',
  } as Record<string, string>,
);

const getViewFromPath = (pathname: string): string => {
  const segment = pathname.replace(/^\/+/, '').split('/').slice(0, 2).join('/') || '';
  const firstSegment = segment.split('/')[0] ?? '';

  if (PATH_TO_VIEW[segment]) {
    return PATH_TO_VIEW[segment];
  }

  return PATH_TO_VIEW[firstSegment] ?? 'dashboard';
};

const getPathForView = (view: string): string => VIEW_TO_PATH[view] ?? '/';

const Spinner = (
  <div className="min-h-screen bg-gradient-to-br from-primary-50 via-background-tint to-secondary-50 flex items-center justify-center">
    <div className="text-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto mb-4"></div>
      <p className="text-text-secondary">🔄 Loading Badminton Booking...</p>
    </div>
  </div>
);

const RoleDashboard: React.FC = () => {
  const { userProfile } = useAuthStore();

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
};

const ProtectedLayout: React.FC = () => {
  const { user, userProfile, loading } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);

  const activeView = React.useMemo(() => getViewFromPath(location.pathname), [location.pathname]);

  const handleViewChange = React.useCallback(
    (view: string) => {
      const targetPath = getPathForView(view);
      if (location.pathname !== targetPath) {
        navigate(targetPath, { replace: true });
      }
    },
    [navigate, location.pathname],
  );

  React.useEffect(() => {
    setIsSidebarOpen(false);
  }, [location.pathname]);

  if (window.location.search.includes('debug=supabase')) {
    return <SupabaseVerification />;
  }

  if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
    return <SupabaseSetup />;
  }

  if (loading) {
    return Spinner;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

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
            <Outlet />
          </div>
        </main>
      </div>
      <Footer />
    </div>
  );
};

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<HomeRedirect />} />
        <Route path="/home" element={<HomeRedirect />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/db-connection" element={<DatabaseConnection />} />

        {/* Authenticated layout */}
        <Route element={<ProtectedLayout />}>
          <Route path="/dashboard" element={<RoleDashboard />} />
          <Route path="/book-court" element={<BookCourt />} />
          <Route path="/my-bookings" element={<MyBookings />} />
          <Route path="/approve-requests" element={<ApproveRequests />} />
          <Route path="/courts" element={<ManageCourts />} />
          <Route path="/manage-slots" element={<ManageSlots />} />
          <Route path="/manage-bookings" element={<ManageBookings />} />
          <Route path="/view-bookings" element={<ViewBookings />} />
          <Route path="/tournaments" element={<TournamentsList />} />
          <Route path="/tournaments/:id" element={<TournamentDetails />} />
          <Route path="/tournaments/edit/:id" element={<EditTournament />} />
          <Route path="/create-tournament" element={<CreateTournament />} />
          <Route path="/profile" element={<ProfileSettings />} />
          <Route path="/find-clubs" element={<FindClubs />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/admin-console" element={<AdminConsole />} />
          <Route
            path="/admin/manage-dropdowns"
            element={
              <RequireRole roles={['Administrator']}>
                <ManageDropdownOptions />
              </RequireRole>
            }
          />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
