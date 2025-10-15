// src/App.tsx
import React from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from 'react-router-dom';

import { AuthForm } from './components/auth/AuthForm';
import Register from './components/auth/Register';
import { Navbar } from './components/layout/Navbar';
import { Sidebar } from './components/layout/Sidebar';
import { PlayerDashboard } from './components/dashboard/PlayerDashboard';
import { ClubDashboard } from './components/dashboard/ClubDashboard';
import { OrganizerDashboard } from './components/dashboard/OrganizerDashboard';
import { BookCourt } from './components/courts/BookCourt';
import QueryProvider from './components/ui/QueryProvider';
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

function AppContent() {
  const { user, userProfile, loading } = useAuthStore();

  const [activeView, setActiveView] = React.useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);

  // NEW: track document visibility to pause redirects while hidden
  const [isDocVisible, setIsDocVisible] = React.useState(
    typeof document !== 'undefined' ? document.visibilityState === 'visible' : true
  );
  React.useEffect(() => {
    const onVis = () => setIsDocVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // NEW: remember the last known authenticated user to guard against
  // short-lived auth gaps that happen on tab switches/focus changes.
  const lastUserRef = React.useRef<typeof user>(null);
  React.useEffect(() => {
    if (user) lastUserRef.current = user;
  }, [user]);

  // NEW: simple spinner component (used in multiple guarded branches)
  const Spinner = (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-blue-50 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600 mx-auto mb-4"></div>
        <p className="text-gray-600">🔄 Loading Badminton Booking...</p>
      </div>
    </div>
  );
  root.render(
  <QueryProvider>
    <App />
  </QueryProvider>
);
  
  React.useEffect(() => {
    console.log('🔎 AppContent state:', { user, userProfile, loading });
  }, [user, userProfile, loading]);

  if (window.location.search.includes('debug=supabase')) {
    return <SupabaseVerification />;
  }

  // Show setup screen if Supabase is not configured
  if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
    return <SupabaseSetup />;
  }

  // While the store is loading, render spinner
  if (loading) {
    return Spinner;
  }

  // NEW: If user is momentarily null (e.g., tab switch) but we had a user before,
  // or the tab is hidden, do NOT redirect yet — show spinner instead.
  const transientAuthGap = !user && !!lastUserRef.current;

  if (!user) {
    if (transientAuthGap || !isDocVisible) {
      return Spinner; // hold state; avoid Navigate while hidden/unstable
    }
    // Safe to redirect only when visible AND not in a transient gap
    return <Navigate to="/login" replace />;
  }

  // If we have a user but no profile (maybe still initializing or RLS catching up),
  // keep a gentle holding state instead of rendering the error immediately.
  if (user && !userProfile) {
    return (
      <div className="p-6 text-center">
        ⏳ Setting up your profile…
        <br />
        If this takes longer than expected, please refresh.
        <br />
        <pre className="text-left mt-4 bg-gray-100 p-4 rounded text-sm">
          {JSON.stringify({ id: user.id, email: (user as any)?.email }, null, 2)}
        </pre>
      </div>
    );
  }

  const renderMainContent = () => {
    switch (activeView) {
      case 'dashboard':
        switch (userProfile.type) {
          case 'Player':
            return <PlayerDashboard />;
          case 'Club':
            return <ClubDashboard />;
          case 'Organizer':
            return <OrganizerDashboard />;
          default:
            return <PlayerDashboard />;
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
      default:
        return (
          <div className="flex items-center justify-center h-96">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Coming Soon</h2>
              <p className="text-gray-600">This feature is under development.</p>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar onMenuClick={() => setIsSidebarOpen(true)} />
      <div className="flex">
        <Sidebar
          activeView={activeView}
          onViewChange={setActiveView}
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
        />
        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto">{renderMainContent()}</div>
        </main>
      </div>
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
