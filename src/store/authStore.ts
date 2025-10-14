// src/store/authStore.ts
import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';

const dbg = (...args: any[]) => console.log('[AUTH]', ...args);

// Custom error code you can catch in the UI to redirect to /check-email
export class EmailNotVerifiedError extends Error {
  code = 'EMAIL_NOT_VERIFIED';
  constructor(msg = 'Please verify your email address.') { super(msg); }
}

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
      userType: 'Player' | 'Club' | 'Organizer'; // add 'Administrator' if exposed in UI
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

function roleMetaByType(type: UserProfile['type']): { table: string; nameField: string } {
  switch (type) {
    case 'Player':        return { table: 'player_users',     nameField: 'full_name' };
    case 'Club':          return { table: 'club_users',       nameField: 'club_name' };
    case 'Organizer':     return { table: 'organizer_users',  nameField: 'organizer_name' };
    case 'Administrator': return { table: 'admin_users',      nameField: 'full_name' };
  }
}

function resolveUserType(user: User): UserProfile['type'] {
  const meta = (user?.user_metadata ?? {}) as Record<string, any>;
  const t = (meta.profile_type ?? meta.userType ?? 'Player') as string;
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Read the user's role row that the DB trigger creates after email verification.
 * A tiny one-shot retry helps in edge cases where redirect and trigger complete at the same time.
 */
async function loadUserProfile(user: User): Promise<UserProfile | null> {
  const type = resolveUserType(user);
  const { table, nameField } = roleMetaByType(type);
  const profile_id = resolveProfileIdByType(type);

  // attempt + one retry
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data: info, error } = await supabase
      .from(table)
      .select(`${nameField}, email, phone_number, country_id`)
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) throw error;
    if (info) {
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

    // brief backoff before a single retry
    if (attempt === 0) await sleep(300);
  }

  return null;
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

    // Block unverified users → let UI route to /check-email
    if (!user.email_confirmed_at) {
      // keep the app unauthenticated to avoid hitting dashboard
      await supabase.auth.signOut();
      throw new EmailNotVerifiedError('Please verify your email address. Check Inbox & Junk/Spam.');
    }

    // Load provisioned role row (trigger created it after verification)
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
          // where Supabase will redirect after the user clicks the email link
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: {
            name: userData?.name ?? null,
            phone_number: userData?.phone_number ?? null,
            country_id: userData?.country_id ?? null,
            address: userData?.address ?? null,
            website: userData?.website ?? null,
            company_name: userData?.company_name ?? null,
            skill_level: userData?.skill_level ?? null,
            // Trigger reads these and inserts into the correct role table AFTER verification
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

      // With email confirmations on, this will be null (no session yet)
      if (!sessionUser) {
        set({ loading: false });
        return 'needs_verification';
      }

      // If you allow auto-confirm in some environments, guard against unverified
      if (!sessionUser.email_confirmed_at) {
        await supabase.auth.signOut();
        set({ loading: false });
        return 'needs_verification';
      }

      // Verified immediately (rare) → role rows should exist now
      const profile = await loadUserProfile(sessionUser);
      set({ user: sessionUser, userProfile: profile ?? null, loading: false });
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

    // Don’t hit role tables before email is confirmed
    if (!user.email_confirmed_at) {
      set({ user: null, userProfile: null, loading: false });
      return;
    }

    const profile = await loadUserProfile(user);
    set({ user, userProfile: profile ?? null, loading: false });
  },
}));

/* -------------------------- bootstrap auth state -------------------------- */

supabase.auth.getUser().then(({ data: { user } }) => {
  if (user && user.email_confirmed_at) {
    useAuthStore.setState({ user, loading: true });
    useAuthStore
      .getState()
      .fetchUserProfile()
      .catch(() => useAuthStore.setState({ loading: false }));
  } else {
    // If not confirmed or no user, stay logged out so router can show /check-email or /login
    useAuthStore.setState({ user: null, userProfile: null, loading: false });
  }
});

supabase.auth.onAuthStateChange((_event, session) => {
  const user = session?.user ?? null;
  if (user && user.email_confirmed_at) {
    useAuthStore.setState({ user, loading: true });
    useAuthStore
      .getState()
      .fetchUserProfile()
      .catch(() => useAuthStore.setState({ loading: false }));
  } else {
    useAuthStore.setState({ user: null, userProfile: null, loading: false });
  }
});
