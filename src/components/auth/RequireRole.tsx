// src/components/auth/RequireRole.tsx
import React from "react";
import { Navigate } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";

type Role = "Administrator" | "Club" | "Organizer" | "Player" | "Group";

type Props = {
  roles: Role[];
  children: React.ReactNode;
};

export const RequireRole: React.FC<Props> = ({ roles, children }) => {
  const { userProfile, loading } = useAuthStore();
  if (loading) return null;
  if (!userProfile) return <Navigate to="/login" replace />;
  if (!roles.includes(userProfile.type as Role)) return <Navigate to="/" replace />;
  return <>{children}</>;
};
