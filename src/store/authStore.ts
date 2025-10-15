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
  userType?: UserType;
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

  // Password auth
  signIn: (email: string, password: string) => Promise<void>;

  // OTP auth (email magic code)
  sendEmailOtp: (email: string, userData?: SignupMeta) => Promise<void>;
  verifyEmailOtp: (email: string, token: string, newPassword?: string) => Promise<void>;

  // Optional classic signup
  signUp: (email: string, password: string, userData?: SignupMeta) => Promise<SignUpStatus>;

  signOut: () => Promise<void>;
  fetchUserProfile: () => Promise<void>;
}

/* ========================= Helpers / DB lookups ========================== */

// SHA-256 hex using WebCrypto
async function sha256Hex(s: string): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('WebCrypto not available for hashing');
  const enc = new TextEncoder().encode(s);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Map friendly role -> profile_id (keep in sync with your catalog)
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

// Upsert the row for the user's role (idempotent by user_id)
async function createRoleRowForUser(
  user: User,
  profile_id: string,
  userData: Required<Pick<SignupMeta, 'userType' | 'name'>> & SignupMeta
): Promise<void> {
  const base = {
    user_id: user.id,
    profile_id,
    email: user.email ?? '',
    phone_number: userData.phone_number ?? null,
    country_id: userData.country_id ?? null,
  };

  if (userData.userType === 'Player') {
    const { error } = await supabase
      .from('player_users')
      .upsert(
        {
          ...base,
          full_name: userData.name ?? (user.user_metadata as any)?.name ?? null,
          skill_level: userData.skill_level ?? null,
        },
        { onConflict: 'user_id' }
      );
    if (error) throw error;
    return;
  }

  if (userData.userType === 'Club') {
    const { error } = await supabase
      .from('club_users')
      .upsert(
        {
          ...base,
          club_name: userData.name,
          address: userData.address ?? null,
          website: userData.website ?? null,
        },
        { onConflict: 'user_id' }
      );
    if (error) throw error;
    return;
  }

  if (userData.userType === 'Organizer') {
    const { error } = await supabase
      .from('organizer_users')
      .upsert(
        {
          ...base,
          organizer_name: userData.name,
          company_name: userData.company_name ?? null,
          website: userData.website ?? null,
        },
        { onConflict: 'user_id' }
      );
    if (error) throw error;
    return;
  }

  if (userData.userType === 'Administrator') {
    const { error } = await supabase
      .from('admin_users')
      .upsert(
        {
          ...base,
          full_name: userData.name,
          website: userData.website ?? null,
        },
        { onConflict: 'user_id' }
      );
    if (error) throw error;
    return;
  }

  throw new Error('Unhandled user type');
}

async function loadUserProfile(user: User): Promise<UserProfile | null> {
  // auth_user_profiles: view resolving user_id -> profile_id, profile_type, etc.
  const { data: profileRow, error: profileErr } = await supabase
    .from('auth_user_profiles')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (profileErr) throw profileErr;
  if (!profileRow) return null;

  const pType = profileRow.profile_type as UserType;
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
    type: pType,
    name: (info as any)?.[nameField] ?? '',
    email: (info as any)?.email ?? (user.email ?? ''),
    phone_number: (info as any)?.phone_number ?? undefined,
    country_id: (info as any)?.country_id ?? null,
  };
}

// Ensure the correct role row exists; return the joined profile
async function ensureProvisioned(user: User): Promise<UserProfile | null> {
  let profile = await loadUserProfile(user);
  if (profile) return profile;

  const meta = (user.user_metadata ?? {}) as {
    userType?: UserType; name?: string; phone_number?: string | null;
    country_id?: string | null; address?: string | null;
    website?: string | null; company_name?: string | null;
    skill_level?: string | null;
  };

  const type: UserType = (meta.userType as UserType) ?? 'Player';
  const profile_id = await getProfileIdByName(type);

  await createRoleRowForUser(user, profile_id, {
    userType: type,
    name: meta.name ?? (user.email ?? 'User'),
    phone_number: meta.phone_number ?? null,
    country_id: meta.country_id ?? null,
    address: meta.address ?? null,
    website: meta.website ?? null,
    company_name: meta.company_name ?? null,
    skill_level: meta.skill_level ?? null,
  });

  return await loadUserProfile(user);
}

/* =============================== Store =================================== */

export const useAuthStore = create<AuthState>(() => ({
  user: null,
  userProfile: null,
  loading: true,

  /* ----------------------------- PASSWORD SIGN-IN ------------------------- */
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

  /* --------------------------------- OTP SEND ---------------------------- */
  sendEmailOtp: async (rawEmail, userData) => {
    useAuthStore.setState({ loading: true });
    const email = (rawEmail ?? '').trim().toLowerCase();
    dbg('otp:send:start', { email, meta: userData });

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        data: {
          name: userData?.name ?? null,
          phone_number: userData?.phone_number ?? null,
          country_id: userData?.country_id ?? null,
          profile_type: userData?.userType ?? 'Player', // your view uses this
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

    // Audit "sent" (non-blocking)
    try {
      await supabase.from('email_otp_audit').insert({
        email,
        context: 'email_otp',
        status: 'sent',
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      });
    } catch (e) {
      console.warn('[AUTH] audit insert failed (send)', e);
    }

    useAuthStore.setState({ loading: false });
  },

  /* ------------------------------- OTP VERIFY ---------------------------- */
  verifyEmailOtp: async (rawEmail, rawToken, newPassword) => {
    useAuthStore.setState({ loading: true });
    const email = (rawEmail ?? '').trim().toLowerCase();
    const token = (rawToken ?? '').toString().replace(/\D/g, '').trim(); // digits only

    dbg('otp:verify:start', { email, token_len: token.length });

    let auditId: string | null = null;

    try {
      // 1) Audit attempt (hash + last4) — non-blocking
      try {
        const tokenHash = await sha256Hex(token);
        const tokenLast4 = token.slice(-4);
        const { data } = await supabase
          .from('email_otp_audit')
          .insert({
            email,
            context: 'email_otp',
            token_hash: tokenHash,
            token_last4: tokenLast4,
            attempts: 1,
            status: 'sent',
            user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
          })
          .select('id')
          .single();
        auditId = data?.id ?? null;
      } catch (e) {
        console.warn('[AUTH] audit insert failed (verify)', e);
      }

      // 2) Verify with Supabase — type 'email'
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token,
        type: 'email',
      });

      if (error) {
        dbg('otp:verify:error', { name: error.name, message: error.message, status: (error as any)?.status });
        try {
          if (auditId) {
            await supabase.from('email_otp_audit').update({ status: 'failed' }).eq('id', auditId);
          }
        } catch {}
        throw error;
      }

      const user = data.user ?? (await supabase.auth.getUser()).data.user ?? null;
      if (!user) {
        try {
          if (auditId) {
            await supabase.from('email_otp_audit').update({ status: 'failed' }).eq('id', auditId);
          }
        } catch {}
        throw new Error('Verification succeeded but no user session');
      }

      // Optional: set password post-OTP
      if (newPassword) {
        const { error: pwErr } = await supabase.auth.updateUser({ password: newPassword });
        if (pwErr) {
          try {
            if (auditId) {
              await supabase.from('email_otp_audit').update({ status: 'failed' }).eq('id', auditId);
            }
          } catch {}
          throw pwErr;
        }
      }

      // 3) Provision/load profile (creates player/club/organizer/admin rows as needed)
      const profile = await ensureProvisioned(user);

      // 4) Mark validated (non-blocking)
      try {
        if (auditId) {
          await supabase
            .from('email_otp_audit')
            .update({
              status: 'validated',
              validated_at: new Date().toISOString(),
              user_id: user.id,
            })
            .eq('id', auditId);
        }
      } catch {}

      useAuthStore.setState({ user, userProfile: profile ?? null, loading: false });
    } catch (err: any) {
      dbg('otp:verify:catch', { name: err?.name, message: err?.message, status: err?.status, err });
      useAuthStore.setState({ loading: false });
      throw err;
    }
  },

  /* ------------------------------ PASSWORD SIGN-UP (optional) ------------ */
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
            name: userData?.name ?? null,
            phone_number: userData?.phone_number ?? null,
            country_id: userData?.country_id ?? null,
            profile_type: userData?.userType ?? 'Player',
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

      // With email confirmations ON, there is no session yet
      if (!sessionUser) {
        useAuthStore.setState({ loading: false });
        return 'needs_verification';
      }

      // If confirmations OFF, there may be a session now
      const profile = await ensureProvisioned(sessionUser);
      useAuthStore.setState({ user: sessionUser, userProfile: profile ?? null, loading: false });
      return 'signed_in';
    } catch (err) {
      useAuthStore.setState({ loading: false });
      throw err;
    }
  },

  /* --------------------------------- SIGN OUT ---------------------------- */
  signOut: async () => {
    await supabase.auth.signOut();
    useAuthStore.setState({ user: null, userProfile: null, loading: false });
  },

  /* --------------------------- FETCH USER PROFILE ------------------------ */
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
