// src/components/layout/Sidebar.tsx
import React from 'react';
import {
  BarChart3,
  Calendar,
  CheckSquare,
  Clock,
  Home,
  List,
  MapPin,
  Plus,
  Trophy,
  Users,
  X,
  Settings,
  BookOpen,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';

type IconType = React.ComponentType<{ className?: string }>;

type ViewKey =
  | 'dashboard'
  | 'book-court'
  | 'my-bookings'
  | 'approve-requests'
  | 'courts'
  | 'manage-slots'
  | 'manage-bookings'
  | 'view-bookings'
  | 'tournaments'
  | 'create-tournament'
  | 'profile'
  | 'find-clubs'
  | 'analytics'
  | 'admin-console';

type Item = {
  label: string;
  view: ViewKey;
  icon: IconType;
};

interface SidebarProps {
  activeView: string;
  onViewChange: (view: ViewKey) => void;
  isOpen?: boolean;
  onClose?: () => void;
}

const MENU_CONFIG_MAP = {
  Administrator: [
    { label: 'Dashboard', view: 'dashboard', icon: Home },
    { label: 'Admin Console', view: 'admin-console', icon: Settings },
    { label: 'Profile Settings', view: 'profile', icon: Users },
    { label: 'Tournaments', view: 'tournaments', icon: Trophy },
    { label: 'Analytics & Reports', view: 'analytics', icon: BarChart3 },
  ],
  Club: [
    { label: 'Dashboard', view: 'dashboard', icon: Home },
    { label: 'Create Courts', view: 'courts', icon: MapPin },
    { label: 'Create Slots', view: 'manage-slots', icon: Clock },
    { label: 'Manage Bookings', view: 'manage-bookings', icon: List },
    { label: 'View Bookings', view: 'view-bookings', icon: Calendar },
    { label: 'Approve Requests', view: 'approve-requests', icon: CheckSquare },
    { label: 'Reports & Analytics', view: 'analytics', icon: BookOpen },
    { label: 'Tournaments', view: 'tournaments', icon: Trophy },
  ],
  Organizer: [
    { label: 'Dashboard', view: 'dashboard', icon: Home },
    { label: 'Manage Bookings', view: 'manage-bookings', icon: List },
    { label: 'Create Slots', view: 'manage-slots', icon: Clock },
    { label: 'Tournaments', view: 'tournaments', icon: Trophy },
    { label: 'Create Tournament', view: 'create-tournament', icon: Plus },
    { label: 'Reports & Analytics', view: 'analytics', icon: BarChart3 },
  ],
  Player: [
    { label: 'Dashboard', view: 'dashboard', icon: Home },
    { label: 'Book Courts', view: 'book-court', icon: Plus },
    { label: 'My Bookings', view: 'my-bookings', icon: Clock },
    { label: 'Search Clubs', view: 'find-clubs', icon: MapPin },
    { label: 'Join Tournaments', view: 'tournaments', icon: Trophy },
  ],
  Group: [
    { label: 'Dashboard', view: 'dashboard', icon: Home },
    { label: 'Manage Bookings', view: 'manage-bookings', icon: List },
    { label: 'My Bookings', view: 'my-bookings', icon: Calendar },
    { label: 'Reports & Analytics', view: 'analytics', icon: BarChart3 },
    { label: 'Tournaments', view: 'tournaments', icon: Trophy },
  ],
} satisfies Record<string, Item[]>;

type RoleKey = keyof typeof MENU_CONFIG_MAP;

const MENU_CONFIG = MENU_CONFIG_MAP as Record<RoleKey, Item[]>;

function normalizeRole(role?: string): RoleKey {
  const key = role?.toLowerCase() ?? '';

  if (['administrator', 'admin'].includes(key)) return 'Administrator';
  if (['club', 'club_player', 'club_players', 'club-player', 'club-players'].includes(key)) return 'Club';
  if (['organizer', 'organisers', 'organizer_user', 'organizer-users'].includes(key)) return 'Organizer';
  if (['group', 'group_user', 'group-users'].includes(key)) return 'Group';
  if (['player', 'user_player', 'user_players', 'player_user', 'player-users'].includes(key)) return 'Player';

  return 'Player';
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeView,
  onViewChange,
  isOpen = false,
  onClose,
}) => {
  const { userProfile } = useAuthStore();
  const normalizedRole = normalizeRole(userProfile?.type);
  const items = MENU_CONFIG[normalizedRole];

  const handleChange = (view: ViewKey) => {
    onViewChange(view);
    if (onClose) {
      onClose();
    }
  };

  const isActive = (view: ViewKey) => activeView === view;

  return (
    <>
      {/* Mobile overlay */}
      <div
        className={`fixed inset-0 z-30 bg-black/30 lg:hidden ${isOpen ? '' : 'hidden'}`}
        onClick={onClose}
      />
      {/* Sidebar */}
      <div
        className={`fixed z-40 h-full w-72 transform bg-background shadow-xl transition-transform lg:static lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="text-lg font-semibold">Menu</div>
          <button className="rounded p-1 lg:hidden" onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-3">
          <nav className="space-y-1">
            {items.map(({ label, view, icon: Icon }) => (
              <button
                key={view}
                onClick={() => handleChange(view)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                  isActive(view)
                    ? 'bg-primary-50 text-primary-600'
                    : 'text-text-secondary hover:bg-background-subtle hover:text-text-primary'
                }`}
              >
                <Icon className={`h-5 w-5 ${isActive(view) ? 'text-primary-500' : 'text-text-secondary'}`} />
                <span className="font-medium">{label}</span>
              </button>
            ))}
          </nav>
        </div>
      </div>
    </>
  );
};
