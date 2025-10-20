// src/components/HomeRedirect.tsx
import React, { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuthStore } from "../store/authStore";

const HomeRedirect: React.FC = () => {
  const { userProfile, loading } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (loading) return;
    if (!userProfile) return; // stays on current route, let auth guard handle
    const role = userProfile.type;
    const target =
      role === "Administrator" ? "/admin" :
      role === "Club" ? "/club" :
      role === "Organizer" ? "/organizer" :
      role === "Group" ? "/group" :
      "/player";
    if (location.pathname === "/" || location.pathname === "/home") {
      navigate(target, { replace: true });
    }
  }, [loading, userProfile, location.pathname, navigate]);

  return null;
};

export default HomeRedirect;
