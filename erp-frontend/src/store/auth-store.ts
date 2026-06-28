import { create } from 'zustand';
import { frappe } from '@/lib/frappe';
import type { User } from '@/types/erp';

interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkSession: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,
  error: null,

  login: async (email, password) => {
    set({ loading: true, error: null });
    try {
      await frappe.login(email, password);
      const username = await frappe.getLoggedUser();
      const userData = await frappe.getDoc('User', username);
      set({
        user: {
          name: userData.name,
          email: userData.email,
          full_name: userData.full_name,
          user_image: userData.user_image,
          roles: (userData.roles || []).map((r: { role: string }) => r.role),
        },
        loading: false,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Login failed';
      set({ error: message, loading: false });
      throw err;
    }
  },

  logout: async () => {
    await frappe.logout();
    set({ user: null });
  },

  checkSession: async () => {
    try {
      const username = await frappe.getLoggedUser();
      if (username === 'Guest') {
        set({ user: null, loading: false });
        return;
      }
      const userData = await frappe.getDoc('User', username);
      set({
        user: {
          name: userData.name,
          email: userData.email,
          full_name: userData.full_name,
          user_image: userData.user_image,
          roles: (userData.roles || []).map((r: { role: string }) => r.role),
        },
        loading: false,
      });
    } catch {
      set({ user: null, loading: false });
    }
  },
}));
