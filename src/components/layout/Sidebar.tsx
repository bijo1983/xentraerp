// src/components/layout/Sidebar.tsx
import React from 'react';
import {
  BarChart3,
  Calendar,
  CheckSquare,
  ChevronDown,
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
  | 'tournaments-join'
  | 'tournaments-registered'
  | 'tournaments-draws'
  | 'tournaments-schedules'
  | 'tournaments-results'
  | 'profile'
  | 'find-clubs'
  | 'analytics'
  | 'admin-console';

type ChildItem = {
  label: string;
  view: ViewKey;
};

type Item = {
  label: string;
  icon: IconType;
  view?: ViewKey;
  children?: ChildItem[];
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
    {
      label: 'Tournaments',
      icon: Trophy,
      children: [
        { label: 'Join Tournament', view: 'tournaments-join' },
        { label: 'Registered Tournaments', view: 'tournaments-registered' },
        { label: 'Draws', view: 'tournaments-draws' },
        { label: 'Schedules', view: 'tournaments-schedules' },
        { label: 'Results', view: 'tournaments-results' },
      ],
    },
  ],
  Group: [
    { label: 'Dashboard', view: 'dashboard', icon: Home },
    { label: 'Manage Bookings', view: 'manage-bookings', icon: List },
    { label: 'My Bookings', view: 'my-bookings', icon: Calendar },
    { label: 'Reports & Analytics', view: 'analytics', icon: BarChart3 },
    {
      label: 'Tournaments',
      icon: Trophy,
      children: [
        { label: 'Join Tournament', view: 'tournaments-join' },
        { label: 'Registered Tournaments', view: 'tournaments-registered' },
        { label: 'Draws', view: 'tournaments-draws' },
        { label: 'Schedules', view: 'tournaments-schedules' },
        { label: 'Results', view: 'tournaments-results' },
      ],
    },
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
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});

  const handleChange = (view: ViewKey) => {
    onViewChange(view);
    if (onClose) {
      onClose();
    }
  };

  const isActive = (view: ViewKey) => activeView === view;

  const toggleSection = (label: string) => {
    setExpanded(prev => ({ ...prev, [label]: !prev[label] }));
  };

  React.useEffect(() => {
    setExpanded(prev => {
      const next = { ...prev };
      items.forEach(item => {
        if (item.children?.some(child => isActive(child.view))) {
          next[item.label] = true;
        }
      });
      return next;
    });
  }, [items, activeView]);

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
            {items.map(item => {
              const { label, view, icon: Icon, children } = item;
              const hasChildren = Array.isArray(children) && children.length > 0;
              const childActive = hasChildren && children.some(child => isActive(child.view));
              const isParentActive = (view && isActive(view)) || childActive;
              const isOpenSection = hasChildren ? expanded[label] || childActive : false;

              return (
                <div key={label}>
                  <button
                    onClick={() => {
                      if (hasChildren) {
                        toggleSection(label);
                      } else if (view) {
                        handleChange(view);
                      }
                    }}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                      isParentActive
                        ? 'bg-primary-50 text-primary-600'
                        : 'text-text-secondary hover:bg-background-subtle hover:text-text-primary'
                    }`}
                  >
                    <Icon className={`h-5 w-5 ${isParentActive ? 'text-primary-500' : 'text-text-secondary'}`} />
                    <span className="font-medium">{label}</span>
                    {hasChildren && (
                      <ChevronDown
                        className={`ml-auto h-4 w-4 transition-transform ${isOpenSection ? 'rotate-180 text-primary-500' : 'text-text-secondary'}`}
                      />
                    )}
                  </button>

                  {hasChildren && (
                    <div className={`mt-1 space-y-1 ${isOpenSection ? 'block' : 'hidden'}`}>
                      {children.map(child => {
                        const activeChild = isActive(child.view);
                        return (
                          <button
                            key={child.view}
                            onClick={() => handleChange(child.view)}
                            className={`flex w-full items-center gap-2 rounded-lg pl-11 pr-3 py-2 text-sm transition ${
                              activeChild
                                ? 'bg-primary-100 text-primary-600'
                                : 'text-text-secondary hover:bg-background-subtle hover:text-text-primary'
                            }`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${activeChild ? 'bg-primary-500' : 'bg-text-secondary/40'}`}
                            />
                            <span className="font-medium">{child.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        </div>
      </div>
    </>
  );
};
