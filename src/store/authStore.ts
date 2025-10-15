// src/store/authStore.ts
import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';

const dbg = (...args: any[]) => console.log('[AUTH]', ...args);

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
  userType?: UserType;          // your app key
  profile_type?: UserType;      // key you saved in Supabase metadata
  name?: string;
  phone_number?: string | null;
  country_id?: string | null;
  address?: string | null;
  website?: string | null;
  company_name?: string | null;
  skill_level?: string | null;
};

interface AuthState {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;

  signIn: (email: string, password: string) => Promise<void>;
  sendEmailOtp: (email: string, userData?: SignupMeta) => Promise<void>;
  verifyEmailOtp: (email: string, token: string, newPassword?: string) => Promise<void>;
  signUp: (email: string, password: string, userData?: SignupMeta) => Promise<SignUpStatus>;
  signOut: () => Promise<void>;
  fetchUserProfile: () => Promise<void>;
}

/* ========================= Helpers ========================== */

async function sha256Hex(s: string): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('WebCrypto not available for hashing');
  const enc = new TextEncoder().encode(s);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

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

/** Upsert role row (idempotent). Uses .select('user_id') to surface RLS/column errors in Network/console. */
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
    .select('user_id'); // forces representation; easier to debug if RLS fails
  if (error) {
    console.error(`[AUTH] upsert ${table} failed`, error);
    throw error;
  }
}

/** Create role row based on userType */
async function createRoleRowForUser(
  user: User,
  profile_id: string,
  userType: UserType,
  meta: SignupMeta
): Promise<void> {
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

/** Ensure role row exists (provision) then read profile */
async function ensureProvisioned(user: User): Promise<UserProfile | null> {
  // If exists, return
  let profile = await loadUserProfile(user);
  if (profile) return profile;

  // Determine intended type: prefer profile_type, then userType, default Player
  const meta = (user.user_metadata ?? {}) as SignupMeta;
  const intendedType: UserType =
    (meta.profile_type as UserType) ||
    (meta.userType as UserType) ||
    'Player';

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
    useAuthStore.setState({ user, userProfile: profile ?? null, loading: false });
  },

  /* OTP SEND */
  sendEmailOtp: async (rawEmail, userData) => {
    useAuthStore.setState({ loading: true });
    const email = (rawEmail ?? '').trim().toLowerCase();
    dbg('otp:send:start', { email, meta: userData });

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        data: {
          // IMPORTANT: write profile_type so we can provision correctly after verify
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
      useAuthStore.setState({ loading: false });
      throw error;
    }

    // Fire & forget audit (NO .select()!!)
    supabase.from('email_otp_audit').insert({
      email,
      context: 'email_otp',
      status: 'sent',
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    }).catch(e => console.warn('[AUTH] audit insert (send) failed', e));

    useAuthStore.setState({ loading: false });
  },

  /* OTP VERIFY */
  verifyEmailOtp: async (rawEmail, rawToken, newPassword) => {
    useAuthStore.setState({ loading: true });
    const email = (rawEmail ?? '').trim().toLowerCase();
    const token = (rawToken ?? '').toString().replace(/\D/g, '').trim();

    dbg('otp:verify:start', { email, token_len: token.length });

    // Fire & forget audit (NO .select()!!)
    (async () => {
      try {
        const tokenHash = await sha256Hex(token);
        await supabase.from('email_otp_audit').insert({
          email,
          context: 'email_otp',
          token_hash: tokenHash,
          token_last4: token.slice(-4),
          attempts: 1,
          status: 'sent',
          user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        });
      } catch (e) {
        console.warn('[AUTH] audit insert (verify) failed', e);
      }
    })();

    // Verify with Supabase
    const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
    if (error) {
      dbg('otp:verify:error', { name: error.name, message: error.message, status: (error as any)?.status });
      useAuthStore.setState({ loading: false });
      throw error;
    }

    const user = data.user ?? (await supabase.auth.getUser()).data.user ?? null;
    if (!user) {
      useAuthStore.setState({ loading: false });
      throw new Error('Verification succeeded but no user session');
    }

    if (newPassword) {
      const { error: pwErr } = await supabase.auth.updateUser({ password: newPassword });
      if (pwErr) {
        useAuthStore.setState({ loading: false });
        throw pwErr;
      }
    }

    // Provision/load profile (forces upsert to show up in Network; will log errors)
    const profile = await ensureProvisioned(user);

    // Audit validated (NO .select()!!)
    supabase.from('email_otp_audit').insert({
      email,
      context: 'email_otp',
      status: 'validated',
      user_id: user.id,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    }).catch(e => console.warn('[AUTH] audit insert (validated) failed', e));

    useAuthStore.setState({ user, userProfile: profile ?? null, loading: false });
  },

  /* PASSWORD SIGN-UP (optional) */
  signUp: async (rawEmail, password, userData) => {
    try {
      useAuthStore.setState({ loading: true });
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
        useAuthStore.setState({ loading: false });
        throw error;
      }

      const sessionUser = data.user ?? null;

      if (!sessionUser) {
        useAuthStore.setState({ loading: false });
        return 'needs_verification';
      }

      const profile = await ensureProvisioned(sessionUser);
      useAuthStore.setState({ user: sessionUser, userProfile: profile ?? null, loading: false });
      return 'signed_in';
    } catch (err) {
      useAuthStore.setState({ loading: false });
      throw err;
    }
  },

  /* SIGN OUT (ignore stale JWT 403s) */
  signOut: async () => {
    try { await supabase.auth.signOut(); } catch (e) { console.warn('[AUTH] signOut ignored', e); }
    useAuthStore.setState({ user: null, userProfile: null, loading: false });
  },

  /* FETCH PROFILE (boot) */
  fetchUserProfile: async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user ?? null;

    if (!user) {
      useAuthStore.setState({ user: null, userProfile: null, loading: false });
      return;
    }

    const profile = await ensureProvisioned(user);
    useAuthStore.setState({ user, userProfile: profile ?? null, loading: false });
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
