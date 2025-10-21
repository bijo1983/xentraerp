// src/components/HomeRedirect.tsx
import React, { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuthStore } from "../store/authStore";

/**
 * Ensures `/` and `/home` never render blank:
 * - If loading: do nothing.
 * - If signed-out: redirect to /login.
 * - If signed-in: redirect to role dashboard.
 */
const HomeRedirect: React.FC = () => {
  const { user, userProfile, loading } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (loading) return;

    // Signed-out → go to /login
    if (!user) {
      if (location.pathname !== "/login") {
        navigate("/login", { replace: true });
      }
      return;
    }

    // Signed-in → route to role home from / or /home
    if (userProfile && (location.pathname === "/" || location.pathname === "/home")) {
      const role = userProfile.type;
      const target =
        role === "Administrator" ? "/admin" :
        role === "Club" ? "/club" :
        role === "Organizer" ? "/organizer" :
        role === "Group" ? "/group" :
        "/player";
      navigate(target, { replace: true });
    }
  }, [loading, user, userProfile, location.pathname, navigate]);

  return null;
};

export default HomeRedirect;
