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
  Search,
  List,
  CheckSquare,
  BookOpen,
  X,
  ShieldCheck
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { Link } from "react-router-dom";

interface SidebarProps {
  activeView: string;
  onViewChange: (view: string) => void;
  isOpen?: boolean;
  onClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeView, onViewChange, isOpen = true, onClose }) => {
  const { userProfile } = useAuthStore();

  const getMenuItems = () => {
    const baseItems = [
      { id: 'dashboard', label: 'Dashboard', icon: Home },
    ];

    if (!userProfile) return baseItems;

    switch (userProfile.type) {
      case 'Player':
        return [
          ...baseItems,
          { id: 'book-court', label: 'Book Court', icon: Calendar },
          { id: 'my-bookings', label: 'My Bookings', icon: MapPin },
          { id: 'find-clubs', label: 'Find Clubs', icon: Search },
          { id: 'tournaments', label: 'Tournaments', icon: Trophy },
          { id: 'profile', label: 'Profile', icon: Settings },
        ];
      
      case 'Club':
        return [
          ...baseItems,
          { id: 'approve-requests', label: 'Approve Requests', icon: CheckSquare },
          { id: 'courts', label: 'Manage Courts', icon: MapPin },
          { id: 'manage-slots', label: 'Manage Slots', icon: Clock },
          { id: 'manage-bookings', label: 'Manage Bookings', icon: Calendar },
          { id: 'view-bookings', label: 'View Bookings', icon: BookOpen },
          { id: 'tournaments', label: 'Tournaments', icon: Trophy },
          { id: 'create-tournament', label: 'Create Tournament', icon: Plus },
          { id: 'analytics', label: 'Analytics', icon: BarChart3 },
          { id: 'profile', label: 'Profile', icon: Settings },
          { id: 'manage-dropdowns', label: 'Manage Event Dropdowns', icon: List, link: '/admin/manage-dropdown-options' },
        ];

      case 'Group':
        return [
          ...baseItems,
          { id: 'book-court', label: 'Plan Monthly Slots', icon: Calendar },
          { id: 'my-bookings', label: 'Booking History', icon: Clock },
          { id: 'profile', label: 'Profile', icon: Settings },
        ];
      
      case 'Organizer':
        return [
          ...baseItems,
          { id: 'book-court', label: 'Rent Courts', icon: Calendar },
          { id: 'tournaments', label: 'My Tournaments', icon: Trophy },
          { id: 'create-tournament', label: 'Create Tournament', icon: Plus },
          { id: 'participants', label: 'Participants', icon: Users },
          { id: 'profile', label: 'Profile', icon: Settings },
          // Dropdown option manager link for organizers
          { id: 'manage-dropdowns', label: 'Manage Event Dropdowns', icon: List, link: '/admin/manage-dropdown-options' },
        ];
      
      case 'Administrator':
        return [
          ...baseItems,
          { id: 'admin-console', label: 'Admin Console', icon: ShieldCheck },
          { id: 'courts', label: 'All Courts', icon: MapPin },
          { id: 'tournaments', label: 'All Tournaments', icon: Trophy },
          { id: 'analytics', label: 'Analytics', icon: BarChart3 },
          { id: 'settings', label: 'Settings', icon: Settings },
          // Dropdown option manager link for admins
          { id: 'manage-dropdowns', label: 'Manage Event Dropdowns', icon: List, link: '/admin/manage-dropdown-options' },
        ];
      
      default:
        return baseItems;
    }
  };

  const menuItems = getMenuItems();

  const handleItemClick = (itemId: string) => {
    onViewChange(itemId);
    if (onClose) {
      onClose();
    }
  };

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      <div className={`
        fixed lg:static inset-y-0 left-0 z-50
        transform ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0 transition-transform duration-300 ease-in-out
        bg-white w-64 min-h-screen shadow-lg border-r border-gray-200
      `}>
        <div className="p-6">
          <div className="flex justify-between items-center mb-4 lg:hidden">
            <h2 className="text-lg font-semibold text-text-primary">Menu</h2>
            <button
              onClick={onClose}
              className="p-2 text-text-secondary hover:text-text-primary hover:bg-background-subtle rounded-lg transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mb-4 p-3 bg-background-subtle rounded-lg">
            <p className="text-xs text-text-secondary uppercase tracking-wide">Logged in as</p>
            <p className="font-medium text-text-primary capitalize">{userProfile?.type || 'Unknown'}</p>
            <p className="text-sm text-text-secondary truncate">{userProfile?.name}</p>
          </div>

          <nav className="space-y-2">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeView === item.id;

              if (item.link) {
                return (
                  <Link
                    key={item.id}
                    to={item.link}
                    onClick={() => onClose && onClose()}
                    className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-left transition-colors ${
                      isActive
                        ? 'bg-primary-50 text-primary-600 border border-primary-200'
                        : 'text-text-secondary hover:bg-background-subtle hover:text-text-primary'
                    }`}
                  >
                    <Icon className={`h-5 w-5 ${isActive ? 'text-primary-500' : 'text-text-secondary'}`} />
                    <span className="font-medium">{item.label}</span>
                  </Link>
                );
              }

              return (
                <button
                  key={item.id}
                  onClick={() => handleItemClick(item.id)}
                  className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-left transition-colors ${
                    isActive
                      ? 'bg-primary-50 text-primary-600 border border-primary-200'
                      : 'text-text-secondary hover:bg-background-subtle hover:text-text-primary'
                  }`}
                >
                  <Icon className={`h-5 w-5 ${isActive ? 'text-primary-500' : 'text-text-secondary'}`} />
                  <span className="font-medium">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>
    </>
  );
};
