// src/store/authStore.ts
import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';

const dbg = (...args: any[]) => console.log('[AUTH]', ...args);

/* ============================== Types ==================================== */

export type UserProfile = {
  id: string; // equals profile_id in your role catalog
  user_id: string;
  type: 'Player' | 'Club' | 'Organizer' | 'Administrator';
  name: string;
  email: string;
  phone_number?: string;
  country_id?: string | null;
  profile_id: string;
};

export type UserMeta = {
  userType: 'Player' | 'Club' | 'Organizer' | 'Administrator';
  name: string;
  phone_number?: string | null;
  country_id?: string | null;
  address?: string | null;
  website?: string | null;
  company_name?: string | null;
  skill_level?: string | null;
};

type SignUpStatus = 'needs_verification' | 'signed_in';

interface AuthState {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;

  // Password auth
  signIn: (email: string, password: string) => Promise<void>;

  // Passwordless email OTP auth (signup/login)
  sendEmailOtp: (email: string, userData?: Partial<UserMeta>) => Promise<void>;
  verifyEmailOtp: (email: string, token: string, newPassword?: string) => Promise<void>;

  // Password signup (optional)
  signUp: (email: string, password: string, userData?: Partial<UserMeta>) => Promise<SignUpStatus | void>;

  // Session
  signOut: () => Promise<void>;
  fetchUserProfile: () => Promise<void>;
}

/* ========================= Helpers / DB lookups ========================== */

const PROFILE_ID_MAP: Record<'Player'|'Club'|'Organizer'|'Administrator', string> = {
  Player:        'c5289148-8bcd-4b49-8c7a-834b1947ddae',
  Club:          'c0f272d3-dedd-4480-b45d-46e0a1a14f27',
  Organizer:     '51de8f1e-02f6-4bbd-b628-5b831dff6350',
  Administrator: '484435eb-ffde-450b-a3f5-0915b24e1907',
};

async function getProfileIdByName(
  name: 'Player' | 'Club' | 'Organizer' | 'Administrator'
): Promise<string> {
  const id = PROFILE_ID_MAP[name];
  if (!id) throw new Error(`Profile id not configured for "${name}"`);
  return id;
}

// NOTE: Player is created by DB trigger; this fallback only handles Club/Organizer client-side
async function createRoleRowForUser(
  user: User,
  profile_id: string,
  userData: Pick<UserMeta, 'userType' | 'name'> & Partial<UserMeta>
): Promise<void> {
  const base = {
    user_id: user.id,
    profile_id,
    email: user.email ?? '',
    phone_number: userData.phone_number ?? null,
    country_id: userData.country_id ?? null,
  };

  if (userData.userType === 'Player') {
    // Player row must be created by the DB trigger (avoid RLS timing issues).
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

  // Administrator is provisioned elsewhere / by admins
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
    name: (info as any)?.[nameField] ?? '',
    email: (info as any)?.email ?? (user.email ?? ''),
    phone_number: (info as any)?.phone_number ?? undefined,
    country_id: (info as any)?.country_id ?? null,
  };
}

/* =============================== Store =================================== */

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  userProfile: null,
  loading: true,

  /* ----------------------------- PASSWORD SIGN-IN ------------------------- */
  signIn: async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    const user = data.user;
    if (!user) throw new Error('Login failed: no user in session');

    // Enforce email confirmation for password flow
    if (!user.email_confirmed_at) {
      await supabase.auth.signOut();
      throw new Error('Please verify your email address. Check your inbox for the confirmation code.');
    }

    // Load or finish provisioning (Club/Organizer fallback; Player done by trigger)
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

  /* --------------------------------- OTP SEND ---------------------------- */
  sendEmailOtp: async (email: string, userData?: Partial<UserMeta>) => {
    set({ loading: true });
    dbg('otp:send:start', { email, meta: userData });

    // Passwordless email OTP. This both signs up (if needed) and logs in.
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        data: {
          name: userData?.name ?? null,
          phone_number: userData?.phone_number ?? null,
          country_id: userData?.country_id ?? null,
          profile_type: userData?.userType ?? 'Player', // ← your trigger reads this
          address: userData?.address ?? null,
          website: userData?.website ?? null,
          company_name: userData?.company_name ?? null,
          skill_level: userData?.skill_level ?? null,
        },
      },
    });

    if (error) {
      set({ loading: false });
      throw error;
    }

    set({ loading: false });
  },

  /* ------------------------------- OTP VERIFY ---------------------------- */
  verifyEmailOtp: async (email: string, token: string, newPassword?: string) => {
    set({ loading: true });
    dbg('otp:verify:start', { email });

    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,          // 6-digit code from the email
      type: 'email',  // verifying email OTP from signInWithOtp
    });

    if (error) {
      set({ loading: false });
      throw error;
    }

    const user = data.user ?? (await supabase.auth.getUser()).data.user ?? null;
    if (!user) {
      set({ loading: false });
      throw new Error('Verification succeeded but no user session');
    }

    // Optional: set a password after OTP so users can log in with password later
    if (newPassword) {
      const { error: pwErr } = await supabase.auth.updateUser({ password: newPassword });
      if (pwErr) {
        set({ loading: false });
        throw pwErr;
      }
    }

    // Load profile (Player row should be created by trigger at user creation time)
    let profile = await loadUserProfile(user);

    // If profile is still missing (e.g., role not Player), try safe fallback for Club/Organizer
    if (!profile) {
      const meta = user.user_metadata ?? {};
      if (meta.userType && meta.name && meta.userType !== 'Player') {
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

  /* ------------------------------ PASSWORD SIGN-UP (optional) ------------ */
  signUp: async (email: string, password: string, userData?: Partial<UserMeta>) => {
    try {
      set({ loading: true });
      dbg('signup:start', { email, meta: userData });

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name: userData?.name ?? null,
            phone_number: userData?.phone_number ?? null,
            country_id: userData?.country_id ?? null,
            profile_type: userData?.userType ?? 'Player', // ← trigger uses this
            address: userData?.address ?? null,
            website: userData?.website ?? null,
            company_name: userData?.company_name ?? null,
            skill_level: userData?.skill_level ?? null,
          },
        },
      });

      if (error) {
        set({ loading: false });
        throw error;
      }

      const sessionUser = data.user ?? null;

      // With email confirmation ON, there is no session yet:
      if (!sessionUser) {
        set({ loading: false });
        return 'needs_verification';
      }

      // If confirmations OFF, we might already be signed in:
      const profile = await loadUserProfile(sessionUser);
      set({ user: sessionUser, userProfile: profile ?? null, loading: false });
      return 'signed_in';
    } catch (err) {
      set({ loading: false });
      throw err;
    }
  },

  /* --------------------------------- SIGN OUT ---------------------------- */
  signOut: async () => {
    await supabase.auth.signOut();
    set({ user: null, userProfile: null, loading: false });
  },

  /* --------------------------- FETCH USER PROFILE ------------------------ */
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

/* ============================= Bootstrap state =========================== */

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
