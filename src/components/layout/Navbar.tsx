import React from 'react';
import { Activity, User, LogOut, Settings, Menu } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';

interface NavbarProps {
  onMenuClick?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onMenuClick }) => {
  const { userProfile, signOut } = useAuthStore();

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  return (
    <nav className="bg-white shadow-lg border-b border-gray-200">
      <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            {onMenuClick && (
              <button
                onClick={onMenuClick}
                className="lg:hidden mr-2 p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <Menu className="h-6 w-6" />
              </button>
            )}
            <div className="flex-shrink-0 flex items-center">
              <Activity className="h-6 w-6 sm:h-8 sm:w-8 text-emerald-600" />
              <span className="ml-2 text-lg sm:text-xl font-bold text-gray-900">
                BadmintonHub
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-2 sm:space-x-4">
            {userProfile && (
              <>
                <div className="hidden md:flex items-center space-x-2">
                  <User className="h-5 w-5 text-gray-500" />
                  <div className="text-sm">
                    <p className="font-medium text-gray-900">{userProfile.name}</p>
                    <p className="text-gray-500 capitalize">{userProfile.type}</p>
                  </div>
                </div>

                <div className="flex items-center space-x-1 sm:space-x-2">
                  <button className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
                    <Settings className="h-5 w-5" />
                  </button>

                  <button
                    onClick={handleSignOut}
                    className="flex items-center space-x-1 px-2 py-2 sm:px-3 text-gray-700 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <LogOut className="h-4 w-4" />
                    <span className="hidden sm:inline text-sm font-medium">Logout</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};