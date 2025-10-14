// src/store/authStore.ts
import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';

const dbg = (...args: any[]) => console.log('[AUTH]', ...args);

export type UserProfile = {
  id: string; // equals profile_id
  user_id: string;
  type: 'Player' | 'Club' | 'Organizer' | 'Administrator';
  name: string;
  email: string;
  phone_number?: string;
  country_id?: string | null;
  profile_id: string;
};

type SignUpStatus = 'needs_verification' | 'signed_in';

interface AuthState {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    userData: {
      userType: 'Player' | 'Club' | 'Organizer'; // (Add 'Administrator' if you expose it in UI)
      name: string;
      phone_number?: string | null;
      country_id?: string | null;
      address?: string | null;
      website?: string | null;
      company_name?: string | null;
      skill_level?: string | null;
    }
  ) => Promise<SignUpStatus>;
  signOut: () => Promise<void>;
  fetchUserProfile: () => Promise<void>;
}

/* -------------------------- role/profile helpers -------------------------- */

const PROFILE_ID_MAP: Record<'Player'|'Club'|'Organizer'|'Administrator', string> = {
  Player:        'c5289148-8bcd-4b49-8c7a-834b1947ddae',
  Club:          'c0f272d3-dedd-4480-b45d-46e0a1a14f27',
  Organizer:     '51de8f1e-02f6-4bbd-b628-5b831dff6350',
  Administrator: '484435eb-ffde-450b-a3f5-0915b24e1907',
};

function roleMetaByType(type: UserProfile['type']) {
  switch (type) {
    case 'Player':        return { table: 'player_users',     nameField: 'full_name' };
    case 'Club':          return { table: 'club_users',       nameField: 'club_name' };
    case 'Organizer':     return { table: 'organizer_users',  nameField: 'organizer_name' };
    case 'Administrator': return { table: 'admin_users',      nameField: 'full_name' };
  }
}

function resolveUserType(user: User): UserProfile['type'] {
  const meta = (user?.user_metadata ?? {}) as Record<string, any>;
  // Support either "profile_type" or legacy "userType"
  const t = (meta.profile_type ?? meta.userType ?? 'Player') as string;
  // Normalize capitalization just in case
  const norm = (t || 'Player').toString();
  if (['Player','Club','Organizer','Administrator'].includes(norm)) {
    return norm as UserProfile['type'];
  }
  return 'Player';
}

function resolveProfileIdByType(type: UserProfile['type']): string {
  const id = PROFILE_ID_MAP[type];
  if (!id) throw new Error(`PROFILE_ID_MAP missing id for type ${type}`);
  return id;
}

/**
 * Read the user's role row that the DB trigger should have created.
 * Returns null if not found (e.g., just after email confirmation and trigger hasn’t run yet).
 */
async function loadUserProfile(user: User): Promise<UserProfile | null> {
  const type = resolveUserType(user);
  const { table, nameField } = roleMetaByType(type);
  const profile_id = resolveProfileIdByType(type);

  const { data: info, error } = await supabase
    .from(table)
    .select(`${nameField}, email, phone_number, country_id`)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) throw error;
  if (!info) return null;

  return {
    id: profile_id,
    user_id: user.id,
    profile_id,
    type,
    name: (info as any)?.[nameField] ?? '',
    email: (info as any)?.email ?? (user.email ?? ''),
    phone_number: (info as any)?.phone_number ?? undefined,
    country_id: (info as any)?.country_id ?? null,
  };
}

/* ------------------------------ zustand store ----------------------------- */

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  userProfile: null,
  loading: true,

  /* ------------------------------- sign in -------------------------------- */
  signIn: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    const user = data.user;
    if (!user) throw new Error('Login failed: no user in session');

    // 🚫 Block if email not confirmed
    if (!user.email_confirmed_at) {
      await supabase.auth.signOut();
      throw new Error('Please verify your email address. Check your inbox for the confirmation link.');
    }

    // Load provisioned role row (the DB trigger should have created it)
    const profile = await loadUserProfile(user);

    set({ user, userProfile: profile ?? null, loading: false });
  },

  /* ------------------------------- sign up -------------------------------- */
  signUp: async (email, password, userData) => {
    try {
      set({ loading: true });

      const profile_type = (userData?.userType ?? 'Player') as UserProfile['type'];
      const profile_id = resolveProfileIdByType(profile_type);

      dbg('signup:start', { email, profile_type, profile_id, meta: userData });
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name: userData?.name ?? null,
            phone_number: userData?.phone_number ?? null,
            country_id: userData?.country_id ?? null,
            address: userData?.address ?? null,
            website: userData?.website ?? null,
            company_name: userData?.company_name ?? null,
            skill_level: userData?.skill_level ?? null,
            // 👇 Server trigger reads these to insert into the correct role table
            profile_type,
            profile_id,
          },
        },
      });

      dbg('signup:result', { data, error });
      if (error) {
        set({ loading: false });
        throw error;
      }

      const sessionUser = data.user ?? null;

      // If email confirmations are enabled, there may be no session yet.
      if (!sessionUser) {
        set({ loading: false });
        return 'needs_verification';
      }

      // Trigger should have provisioned the role row already
      const profile = await loadUserProfile(sessionUser);

      set({
        user: sessionUser,
        userProfile: profile ?? null,
        loading: false,
      });

      return 'signed_in';
    } catch (err: any) {
      set({ loading: false });
      throw err;
    }
  },

  /* ------------------------------- sign out ------------------------------- */
  signOut: async () => {
    await supabase.auth.signOut();
    set({ user: null, userProfile: null, loading: false });
  },

  /* --------------------------- fetch user profile -------------------------- */
  fetchUserProfile: async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user ?? null;

    if (!user) {
      set({ user: null, userProfile: null, loading: false });
      return;
    }

    const profile = await loadUserProfile(user);
    set({ user, userProfile: profile ?? null, loading: false });
  },
}));

/* -------------------------- bootstrap auth state -------------------------- */

supabase.auth.getUser().then(({ data: { user } }) => {
  if (user) {
    useAuthStore.setState({ user, loading: true });
    useAuthStore
      .getState()
      .fetchUserProfile()
      .catch(() => useAuthStore.setState({ loading: false }));
  } else {
    useAuthStore.setState({ user: null, userProfile: null, loading: false });
  }
});

supabase.auth.onAuthStateChange((_event, session) => {
  const user = session?.user ?? null;
  if (user) {
    useAuthStore.setState({ user, loading: true });
    useAuthStore
      .getState()
      .fetchUserProfile()
      .catch(() => useAuthStore.setState({ loading: false }));
  } else {
    useAuthStore.setState({ user: null, userProfile: null, loading: false });
  }
});
