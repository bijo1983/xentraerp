// src/components/layout/Sidebar.tsx
import React from 'react';
import {
  Home,
  Calendar,
  Trophy,
  MapPin,
  Users,
  BarChart3,
  Settings,
  Plus,
  Clock,
  List,
  CheckSquare,
  BookOpen,
  X,
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

type Item = { label: string; path: string; icon: React.ComponentType<{ className?: string }> };

export const Sidebar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { userProfile } = useAuthStore();
  const role = userProfile?.type; // 'Administrator' | 'Club' | 'Organizer' | 'Player' | 'Group'
  const [isOpen, setOpen] = React.useState(true);

  const adminItems: Item[] = [
    { label: 'Home', path: '/', icon: Home },
    { label: 'Admin Console', path: '/admin', icon: Settings },
    { label: 'Tournaments', path: '/tournaments', icon: Trophy },
    { label: 'Manage Dropdowns', path: '/admin/manage-dropdowns', icon: List }, // ADMIN ONLY
    { label: 'Site Settings', path: '/admin/site', icon: Settings },
  ];

  const clubOrganizerItems: Item[] = [
    { label: 'Home', path: '/', icon: Home },
    { label: 'Dashboard', path: role === 'Club' ? '/club' : '/organizer', icon: BarChart3 },
    { label: 'Courts', path: '/courts/manage', icon: MapPin },
    { label: 'Approve Requests', path: '/bookings/approve', icon: CheckSquare },
    { label: 'Tournaments', path: '/tournaments', icon: Trophy },
    { label: 'Bookings', path: '/bookings', icon: Calendar },
    { label: 'Reports', path: '/reports', icon: BookOpen },
  ];

  const playerGroupItems: Item[] = [
    { label: 'Home', path: '/', icon: Home },
    { label: 'Dashboard', path: role === 'Player' ? '/player' : '/group', icon: BarChart3 },
    { label: 'Book Court', path: '/courts/book', icon: Plus },
    { label: 'My Bookings', path: '/my/bookings', icon: Clock },
    { label: 'Tournaments', path: '/tournaments', icon: Trophy },
  ];

  const items: Item[] =
    role === 'Administrator' ? adminItems
    : (role === 'Club' || role === 'Organizer') ? clubOrganizerItems
    : playerGroupItems;

  return (
    <>
      {/* Mobile overlay */}
      <div
        className={`fixed inset-0 z-30 bg-black/30 lg:hidden ${isOpen ? '' : 'hidden'}`}
        onClick={() => setOpen(false)}
      />
      {/* Sidebar */}
      <div
        className={`fixed z-40 h-full w-72 transform bg-background shadow-xl transition-transform lg:static lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="text-lg font-semibold">Menu</div>
          <button className="rounded p-1 lg:hidden" onClick={() => setOpen(false)}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-3">
          <nav className="space-y-1">
            {items.map(({ label, path, icon: Icon }) => {
              const isActive = location.pathname === path || location.pathname.startsWith(path + '/');
              return (
                <button
                  key={path}
                  onClick={() => navigate(path)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                    isActive
                      ? 'bg-primary-50 text-primary-600'
                      : 'text-text-secondary hover:bg-background-subtle hover:text-text-primary'
                  }`}
                >
                  <Icon className={`h-5 w-5 ${isActive ? 'text-primary-500' : 'text-text-secondary'}`} />
                  <span className="font-medium">{label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>
    </>
  );
};
