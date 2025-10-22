// src/HomeRedirect.tsx
import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from './store/authStore';

const HOME_PATHS = new Set(['/', '/home']);

const ROLE_TARGET_MAP: Record<string, string> = {
  Administrator: '/admin-console',
  Club: '/dashboard',
  Organizer: '/dashboard',
  Group: '/dashboard',
  Player: '/dashboard',
};

const HomeRedirect: React.FC = () => {
  const { user, userProfile, loading } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (loading) return;

    if (HOME_PATHS.has(location.pathname)) {
      if (!user) {
        navigate('/login', { replace: true });
        return;
      }

      if (!userProfile) return;

      const target = ROLE_TARGET_MAP[userProfile.type] ?? '/dashboard';

      if (location.pathname !== target) {
        navigate(target, { replace: true });
      }
    }
  }, [loading, user, userProfile, location.pathname, navigate]);

  return null;
};

export default HomeRedirect;
