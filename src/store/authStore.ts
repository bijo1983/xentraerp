// src/store/authStore.ts
import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';

const dbg = (...args: any[]) => console.log('[AUTH]', ...args);

/* ============================== Types ==================================== */

export type UserType = 'Player' | 'Club' | 'Organizer' | 'Administrator';

export type UserProfile = {
  id: string;               // profile_id from your catalog/view
  user_id: string;
  type: UserType;
  name: string;
  email: string;
  phone_number?: string;
  country_id?: string | null;
  profile_id: string;
};

type SignUpStatus = 'needs_verification' | 'signed_in';

type SignupMeta = {
  userType?: UserType;          // app key (we also store profile_type)
  profile_type?: UserType;      // stored in supabase user_metadata
  name?: string;
  phone_number?: string | null;
  country_id?: string | null;
  address?: string | null;
  website?: string | null;
  company_name?: string | null;
  skill_level?: string | null;
};

type UiStatus =
  | 'idle'
  | 'otp_sent'
  | 'verified_required_login'
  | 'error';

interface AuthState {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  status: UiStatus;
  message: string | null;

  signIn: (email: string, password: string) => Promise<void>;
  sendEmailOtp: (email: string, password: string, userData?: SignupMeta) => Promise<void>;
  verifyEmailOtp: (email: string, token: string) => Promise<void>;
  signUp: (email: string, password: string, userData?: SignupMeta) => Promise<SignUpStatus>;
  signOut: () => Promise<void>;
  fetchUserProfile: () => Promise<void>;
}

/* ========================= Helpers ========================== */

// In-memory stash across OTP send -> verify (per email)
const pendingPasswords = new Map<string, string>();
const pendingMetas     = new Map<string, SignupMeta>();

const PROFILE_ID_MAP: Record<UserType, string> = {
  Player:        'c5289148-8bcd-4b49-8c7a-834b1947ddae',
  Club:          'c0f272d3-dedd-4480-b45d-46e0a1a14f27',
  Organizer:     '51de8f1e-02f6-4bbd-b628-5b831dff6350',
  Administrator: '484435eb-ffde-450b-a3f5-0915b24e1907',
};

async function getProfileIdByName(name: UserType): Promise<string> {
  const id = PROFILE_ID_MAP[name];
  if (!id) throw new Error(`Profile id not configured for "${name}"`);
  return id;
}

/** Upsert role row (idempotent) and force returning to surface RLS/column errors in console. */
async function upsertRoleRow(
  table:
    | 'player_users'
    | 'club_users'
    | 'organizer_users'
    | 'admin_users',
  payload: Record<string, any>
): Promise<void> {
  console.log('[AUTH] upsert', table, payload);
  const { error } = await supabase
    .from(table)
    .upsert(payload, { onConflict: 'user_id' })
    .select('user_id'); // ensures any RLS/column errors show up in Network
  if (error) {
    console.error(`[AUTH] upsert ${table} failed`, error);
    throw error;
  }
}

/** Create role row based on userType (adjust columns to match your schema exactly). */
async function createRoleRowForUser(
  user: User,
  profile_id: string,
  userType: UserType,
  meta: SignupMeta
): Promise<void> {
  const requiresCountry = userType === 'Player' || userType === 'Club' || userType === 'Organizer';
  if (requiresCountry && !meta.country_id) {
    throw new Error('Country is required for player, club, and organizer accounts.');
  }

  const base = {
    user_id: user.id,
    profile_id,
    email: user.email ?? '',
    phone_number: meta.phone_number ?? null,
    country_id: meta.country_id ?? null,
  };

  switch (userType) {
    case 'Player':
      await upsertRoleRow('player_users', {
        ...base,
        full_name: meta.name ?? (user.user_metadata as any)?.name ?? null,
        skill_level: meta.skill_level ?? null,
      });
      return;
    case 'Club':
      await upsertRoleRow('club_users', {
        ...base,
        club_name: meta.name ?? (user.user_metadata as any)?.name ?? null,
        address: meta.address ?? null,
        website: meta.website ?? null,
      });
      return;
    case 'Organizer':
      await upsertRoleRow('organizer_users', {
        ...base,
        organizer_name: meta.name ?? (user.user_metadata as any)?.name ?? null,
        company_name: meta.company_name ?? null,
        website: meta.website ?? null,
      });
      return;
    case 'Administrator':
      await upsertRoleRow('admin_users', {
        ...base,
        full_name: meta.name ?? (user.user_metadata as any)?.name ?? null,
        website: meta.website ?? null,
      });
      return;
  }
}

/** Read aggregated profile via your view */
async function loadUserProfile(user: User): Promise<UserProfile | null> {
  const { data: profileRow, error: profileErr } = await supabase
    .from('auth_user_profiles')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (profileErr) throw profileErr;
  if (!profileRow) return null;

  const type = profileRow.profile_type as UserType;

  const roleTable =
    type === 'Player' ? 'player_users' :
    type === 'Club' ? 'club_users' :
    type === 'Organizer' ? 'organizer_users' :
    type === 'Administrator' ? 'admin_users' : '';

  const nameField =
    type === 'Player' ? 'full_name' :
    type === 'Club' ? 'club_name' :
    type === 'Organizer' ? 'organizer_name' :
    'full_name';

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
    type,
    name: (info as any)?.[nameField] ?? '',
    email: (info as any)?.email ?? (user.email ?? ''),
    phone_number: (info as any)?.phone_number ?? undefined,
    country_id: (info as any)?.country_id ?? null,
  };
}

/** Ensure role row exists (uses PENDING META first; falls back to user_metadata; default Player) */
async function ensureProvisioned(user: User): Promise<UserProfile | null> {
  let profile = await loadUserProfile(user);
  if (profile) return profile;

  const email = (user.email ?? '').toLowerCase();
  const metaFromPending = pendingMetas.get(email) ?? {};
  const metaFromUser    = (user.user_metadata ?? {}) as SignupMeta;

  const intendedType: UserType =
    (metaFromPending.profile_type as UserType) ||
    (metaFromPending.userType as UserType) ||
    (metaFromUser.profile_type as UserType) ||
    (metaFromUser.userType as UserType) ||
    'Player';

  const meta: SignupMeta = {
    ...metaFromUser,
    ...metaFromPending,
    profile_type: intendedType,
  };

  const profile_id = await getProfileIdByName(intendedType);
  console.log('[AUTH] provision:start', { user_id: user.id, intendedType, meta });

  await createRoleRowForUser(user, profile_id, intendedType, meta);

  profile = await loadUserProfile(user);
  console.log('[AUTH] provision:end', { user_id: user.id, ok: !!profile });

  return profile;
}

/* =============================== Store =================================== */

export const useAuthStore = create<AuthState>(() => ({
  user: null,
  userProfile: null,
  loading: true,
  status: 'idle',
  message: null,

  /* PASSWORD SIGN-IN */
  signIn: async (rawEmail, password) => {
    const email = (rawEmail ?? '').trim().toLowerCase();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    const user = data.user;
    if (!user) throw new Error('Login failed: no user in session');

    if (!user.email_confirmed_at) {
      await supabase.auth.signOut();
      throw new Error('Please verify your email address. Check your inbox for the confirmation code.');
    }

    const profile = await ensureProvisioned(user);
    useAuthStore.setState({ user, userProfile: profile ?? null, loading: false, status: 'idle', message: null });
  },

  /**
   * OTP SEND — requires password first (min 8 chars).
   * We stash both password and meta until verification.
   */
  sendEmailOtp: async (rawEmail, rawPassword, userData) => {
    useAuthStore.setState({ loading: true, status: 'idle', message: null });

    const email = (rawEmail ?? '').trim().toLowerCase();
    const password = (rawPassword ?? '').trim();
    const requiresCountry =
      userData?.userType === 'Player' ||
      userData?.userType === 'Club' ||
      userData?.userType === 'Organizer';

    if (!password || password.length < 8) {
      useAuthStore.setState({
        loading: false,
        status: 'error',
        message: 'Password is required (min 8 characters) before requesting the OTP.',
      });
      throw new Error('Password required before sending OTP');
    }

    if (requiresCountry && !userData?.country_id) {
      useAuthStore.setState({
        loading: false,
        status: 'error',
        message: 'Country is required for player, club, and organizer signups.',
      });
      throw new Error('Country is required for player, club, and organizer signups.');
    }

    // keep password + meta in memory until verify
    pendingPasswords.set(email, password);
    pendingMetas.set(email, {
      ...userData,
      profile_type: userData?.profile_type ?? userData?.userType ?? 'Player',
    });

    dbg('otp:send:start', { email, meta: pendingMetas.get(email) });

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        // we try to persist meta here, but we rely on our pending cache later
        data: pendingMetas.get(email),
      },
    });

    if (error) {
      useAuthStore.setState({ loading: false, status: 'error', message: error.message || 'Failed to send OTP.' });
      throw error;
    }

    useAuthStore.setState({ loading: false, status: 'otp_sent', message: 'OTP sent to your email.' });
  },

  /**
   * OTP VERIFY — confirms OTP, writes password & metadata, provisions role,
   * then signs out and asks user to log in with credentials.
   */
  verifyEmailOtp: async (rawEmail, rawToken) => {
    useAuthStore.setState({ loading: true, status: 'idle', message: null });

    const email = (rawEmail ?? '').trim().toLowerCase();
    const token = (rawToken ?? '').toString().replace(/\D/g, '').trim();

    dbg('otp:verify:start', { email, token_len: token.length });

    const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
    if (error) {
      dbg('otp:verify:error', { name: error.name, message: error.message, status: (error as any)?.status });
      useAuthStore.setState({ loading: false, status: 'error', message: error.message || 'OTP verification failed.' });
      throw error;
    }

    const user = data.user ?? (await supabase.auth.getUser()).data.user ?? null;
    if (!user) {
      useAuthStore.setState({ loading: false, status: 'error', message: 'Verification succeeded but no user session.' });
      throw new Error('Verification succeeded but no user session');
    }

    // 1) Set password + metadata captured at OTP-send time
    const pw   = pendingPasswords.get(email);
    const meta = pendingMetas.get(email);
    if (!pw || !meta) {
      // ensure the user cannot proceed without password
      try { await supabase.auth.signOut(); } catch {}
      useAuthStore.setState({
        user: null,
        userProfile: null,
        loading: false,
        status: 'error',
        message: 'Password not provided. Please request a new OTP after entering a password.',
      });
      throw new Error('Missing password/meta at verify');
    }

    const { error: upErr } = await supabase.auth.updateUser({
      password: pw,
      data: meta, // ensure profile_type persists to user
    });
    if (upErr) {
      useAuthStore.setState({ loading: false, status: 'error', message: upErr.message || 'Failed to set password.' });
      throw upErr;
    }

    // 2) Provision role + profile (uses pending meta first)
    await ensureProvisioned(user);

    // clear pending caches
    pendingPasswords.delete(email);
    pendingMetas.delete(email);

    // 3) Immediately sign out to enforce credentialed login and show success page
    try { await supabase.auth.signOut(); } catch { /* ignore stale jwt */ }

    useAuthStore.setState({
      user: null,
      userProfile: null,
      loading: false,
      status: 'verified_required_login',
      message: 'Verification successful. Please sign in again with your email and password.',
    });
  },

  /* PASSWORD SIGN-UP (optional path) */
  signUp: async (rawEmail, password, userData) => {
    try {
      useAuthStore.setState({ loading: true, status: 'idle', message: null });
      const email = (rawEmail ?? '').trim().toLowerCase();
      dbg('signup:start', { email, meta: userData });

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            profile_type: userData?.profile_type ?? userData?.userType ?? 'Player',
            name: userData?.name ?? null,
            phone_number: userData?.phone_number ?? null,
            country_id: userData?.country_id ?? null,
            address: userData?.address ?? null,
            website: userData?.website ?? null,
            company_name: userData?.company_name ?? null,
            skill_level: userData?.skill_level ?? null,
          },
        },
      });

      if (error) {
        useAuthStore.setState({ loading: false, status: 'error', message: error.message || 'Sign up failed.' });
        throw error;
      }

      const sessionUser = data.user ?? null;

      if (!sessionUser) {
        useAuthStore.setState({ loading: false, status: 'otp_sent', message: 'We sent you a confirmation email. Enter the code to verify.' });
        return 'needs_verification';
      }

      const profile = await ensureProvisioned(sessionUser);
      useAuthStore.setState({ user: sessionUser, userProfile: profile ?? null, loading: false, status: 'idle', message: null });
      return 'signed_in';
    } catch (err) {
      useAuthStore.setState({ loading: false, status: 'error', message: (err as any)?.message || 'Sign up failed.' });
      throw err;
    }
  },

  /* SIGN OUT (ignore stale JWT 403s) */
  signOut: async () => {
    try { await supabase.auth.signOut(); } catch (e) { console.warn('[AUTH] signOut ignored', e); }
    useAuthStore.setState({ user: null, userProfile: null, loading: false, status: 'idle', message: null });
  },

  /* FETCH PROFILE (boot) */
  fetchUserProfile: async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user ?? null;

    if (!user) {
      useAuthStore.setState({ user: null, userProfile: null, loading: false, status: 'idle', message: null });
      return;
    }

    const profile = await ensureProvisioned(user);
    useAuthStore.setState({ user, userProfile: profile ?? null, loading: false, status: 'idle', message: null });
  },
}));

/* ============================= Bootstrap =========================== */

supabase.auth.getUser().then(({ data: { user } }) => {
  if (user) {
    useAuthStore.setState({ user, loading: true });
    useAuthStore.getState().fetchUserProfile().catch(() => useAuthStore.setState({ loading: false }));
  } else {
    useAuthStore.setState({ user: null, userProfile: null, loading: false });
  }
});

supabase.auth.onAuthStateChange((_event, session) => {
  const user = session?.user ?? null;
  if (user) {
    useAuthStore.setState({ user, loading: true });
    useAuthStore.getState().fetchUserProfile().catch(() => useAuthStore.setState({ loading: false }));
  } else {
    useAuthStore.setState({ user: null, userProfile: null, loading: false });
  }
});
