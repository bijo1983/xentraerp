// src/store/authStore.ts
import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';

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
      userType: 'Player' | 'Club' | 'Organizer';
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

/* -------------------------- helpers (DB lookups) -------------------------- */

const PROFILE_ID_MAP: Record<'Player'|'Club'|'Organizer'|'Administrator', string> = {
  Player:       'c5289148-8bcd-4b49-8c7a-834b1947ddae',
  Club:         'c0f272d3-dedd-4480-b45d-46e0a1a14f27',
  Organizer:    '51de8f1e-02f6-4bbd-b628-5b831dff6350',
  Administrator:'484435eb-ffde-450b-a3f5-0915b24e1907',
};

async function getProfileIdByName(
  name: 'Player' | 'Club' | 'Organizer' | 'Administrator'
): Promise<string> {
  const id = PROFILE_ID_MAP[name];
  if (!id) throw new Error(`Profile id not configured for "${name}"`);
  return id;
}

async function createRoleRowForUser(
  user: User,
  profile_id: string,
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
): Promise<void> {
  const base = {
    user_id: user.id,
    profile_id, // ✅ required by schema
    email: user.email ?? '',
    phone_number: userData.phone_number ?? null,
    country_id: userData.country_id ?? null,
  };

  if (userData.userType === 'Player') {
    const { error } = /* direct insert removed: handled by DB trigger */

    if (error) throw error;
    return;
  }

  if (userData.userType === 'Club') {
    const { error } = await supabase.from('club_users').insert({
      ...base,
      club_name: userData.name,
      address: userData.address ?? null,
      website: userData.website ?? null,
    });
    if (error) throw error;
    return;
  }

  if (userData.userType === 'Organizer') {
    const { error } = await supabase.from('organizer_users').insert({
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

async function loadUserProfile(user: User): Promise<UserProfile | null> {
  const { data: profileRow, error: profileErr } = await supabase
    .from('auth_user_profiles')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (profileErr) throw profileErr;
  if (!profileRow) return null;

  const pType = profileRow.profile_type as UserProfile['type'];
  let roleTable = '';
  let nameField = '';

  switch (pType) {
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

  const { data: info } = await supabase
    .from(roleTable)
    .select(`${nameField}, email, phone_number, country_id`)
    .eq('user_id', user.id)
    .maybeSingle();

  return {
    id: profileRow.profile_id,
    user_id: user.id,
    profile_id: profileRow.profile_id,
    type: pType,
    name: info?.[nameField] ?? '',
    email: info?.email ?? (user.email ?? ''),
    phone_number: info?.phone_number ?? undefined,
    country_id: info?.country_id ?? null,
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

    // Load or finish provisioning
    let profile = await loadUserProfile(user);
    if (!profile) {
      const meta = user.user_metadata ?? {};
      if (meta.userType && meta.name) {
        const profile_id = await getProfileIdByName(meta.userType);
        await createRoleRowForUser(user, profile_id, {
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

  /* ------------------------------- sign up -------------------------------- */
  signUp: async (email, password, userData) => {
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
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) throw error;

    const sessionUser = data.user ?? null;

    // If confirm-email is ON, there is typically no session here.
    if (!sessionUser) {
      set({ loading: false });
      return 'needs_verification';
    }

    // If we *do* have a session immediately, provision role row now.
    // Role row created by DB trigger after signup; no client insert needed.
    // const profile_id = await getProfileIdByName(userData.userType);
    // await createRoleRowForUser(sessionUser, profile_id, {
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
    return 'signed_in';
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
