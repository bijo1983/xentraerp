// src/store/authStore.ts
import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';

export type UserProfile = {
  id: string; // profile_id
  user_id: string;
  type: 'Player' | 'Club' | 'Organizer' | 'Administrator';
  name: string;
  email: string;
  phone_number?: string;
  country_id?: string | null;
  profile_id: string;
};

interface AuthState {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;

  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, userData: any) => Promise<void>;
  signOut: () => Promise<void>;
  fetchUserProfile: () => Promise<void>;
}

/**
 * Create role row in the correct table (player_users / club_users / organizer_users).
 * Requires an active session so RLS (auth.uid()) is not NULL.
 */
async function createRoleRowForUser(
  user: User,
  userData: {
    userType: 'Player' | 'Club' | 'Organizer';
    name: string;
    phone_number?: string | null;
    country_id?: string | null;
    address?: string | null;
    website?: string | null;
    company_name?: string | null;
    skill_level?: string | null;
  }
) {
  const base = {
    user_id: user.id, // if you added the DB trigger, you can omit this
    email: user.email ?? '',
    phone_number: userData.phone_number ?? null,
    country_id: userData.country_id ?? null,
  };

  if (userData.userType === 'Player') {
    const { error } = await supabase
      .from('player_users')
      .insert({
        ...base,
        full_name: userData.name,
        skill_level: userData.skill_level ?? 'Beginner',
      });
    if (error) throw error;
    return;
  }

  if (userData.userType === 'Club') {
    const { error } = await supabase
      .from('club_users')
      .insert({
        ...base,
        club_name: userData.name,
        address: userData.address ?? null,
        website: userData.website ?? null,
      });
    if (error) throw error;
    return;
  }

  if (userData.userType === 'Organizer') {
    const { error } = await supabase
      .from('organizer_users')
      .insert({
        ...base,
        organizer_name: userData.name,
        company_name: userData.company_name ?? null,
        website: userData.website ?? null,
      });
    if (error) throw error;
    return;
  }

  throw new Error('Unhandled user type');
}

/**
 * Reads the compact profile from your view and expands basic details from the role table.
 * Expects an active session.
 */
async function loadUserProfile(user: User): Promise<UserProfile | null> {
  // Compact mapping view of user -> profile
  const { data: profileRow, error: profileErr } = await supabase
    .from('auth_user_profiles')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (profileErr) throw profileErr;
  if (!profileRow) return null; // not created yet

  const profileType: UserProfile['type'] = profileRow.profile_type;

  let roleTable: string;
  let nameField: string;

  switch (profileType) {
    case 'Player':
      roleTable = 'player_users';
      nameField = 'full_name';
      break;
    case 'Club':
      roleTable = 'club_users';
      nameField = 'club_name';
      break;
    case 'Organizer':
      roleTable = 'organizer_users';
      nameField = 'organizer_name';
      break;
    case 'Administrator':
      roleTable = 'admin_users';
      nameField = 'full_name';
      break;
    default:
      return null;
  }

  const { data: info, error: infoErr } = await supabase
    .from(roleTable)
    .select(`${nameField}, email, phone_number, country_id`)
    .eq('user_id', user.id)
    .maybeSingle();

  if (infoErr) throw infoErr;

  return {
    id: profileRow.profile_id,
    user_id: user.id,
    profile_id: profileRow.profile_id,
    type: profileType,
    name: info?.[nameField] ?? '',
    email: info?.email ?? (user.email ?? ''),
    phone_number: info?.phone_number ?? undefined,
    country_id: info?.country_id ?? null,
  };
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  userProfile: null,
  loading: true,

  signIn: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    const user = data.user;
    if (!user) throw new Error('Login failed: no user in session');

    // After login, ensure a role row/profile exists (handles the “confirm email first” flow).
    // We try to load; if missing but we have metadata from signup, create it now.
    let profile = await loadUserProfile(user);
    if (!profile) {
      const meta = user.user_metadata ?? {};
      if (meta.userType && meta.name) {
        await createRoleRowForUser(user, {
          userType: meta.userType,
          name: meta.name,
          phone_number: meta.phone_number ?? null,
          country_id: meta.country_id ?? null,
          address: meta.address ?? null,
          website: meta.website ?? null,
          company_name: meta.company_name ?? null,
          skill_level: meta.skill_level ?? null,
        });
        profile = await loadUserProfile(user);
      }
    }

    set({ user, userProfile: profile ?? null, loading: false });
  },

  signUp: async (email, password, userData) => {
    // Store user metadata so we can create the role row later if email confirmation is required
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          userType: userData.userType,
          name: userData.name,
          phone_number: userData.phone_number ?? null,
          country_id: userData.country_id ?? null,
          address: userData.address ?? null,
          website: userData.website ?? null,
          company_name: userData.company_name ?? null,
          skill_level: userData.skill_level ?? null,
        },
      },
    });
    if (error) throw error;

    // If email confirmation is disabled, you’ll have a session now and can create the role row immediately.
    // If confirmation is required, do nothing here. The create happens on first login in signIn() above.
    const sessionUser = data.user;
    if (sessionUser) {
      // We do have a session (auto confirmed)
      await createRoleRowForUser(sessionUser, {
        userType: userData.userType,
        name: userData.name,
        phone_number: userData.phone_number ?? null,
        country_id: userData.country_id ?? null,
        address: userData.address ?? null,
        website: userData.website ?? null,
        company_name: userData.company_name ?? null,
        skill_level: userData.skill_level ?? null,
      });
      const profile = await loadUserProfile(sessionUser);
      set({ user: sessionUser, userProfile: profile ?? null, loading: false });
    } else {
      // No session yet (most likely email confirmation). Let the UI show “check your inbox”.
      set({ loading: false });
    }
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ user: null, userProfile: null, loading: false });
  },

  fetchUserProfile: async () => {
    const { data: session } = await supabase.auth.getSession();
    const user = session.session?.user ?? null;

    if (!user) {
      set({ user: null, userProfile: null, loading: false });
      return;
    }

    const profile = await loadUserProfile(user);
    set({ user, userProfile: profile ?? null, loading: false });
  },
}));

// Bootstrapping: pick up current session on load
supabase.auth.getUser().then(({ data: { user } }) => {
  if (user) {
    useAuthStore.setState({ user, loading: true });
    useAuthStore.getState().fetchUserProfile().catch(() => {
      useAuthStore.setState({ loading: false });
    });
  } else {
    useAuthStore.setState({ user: null, userProfile: null, loading: false });
  }
});

// Keep store in sync with auth changes
supabase.auth.onAuthStateChange((_event, session) => {
  const user = session?.user ?? null;
  if (user) {
    useAuthStore.setState({ user, loading: true });
    useAuthStore.getState().fetchUserProfile().catch(() => {
      useAuthStore.setState({ loading: false });
    });
  } else {
    useAuthStore.setState({ user: null, userProfile: null, loading: false });
  }
});
