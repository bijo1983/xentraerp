// src/store/authStore.ts
import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';

const dbg = (...args: any[]) => console.log('[AUTH]', ...args);

/* ============================== Types ==================================== */

export type UserType = 'Player' | 'Club' | 'Organizer' | 'Administrator';

export type UserProfile = {
  id: string;
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

  signIn: (email: string, password: string) => Promise<void>;
  sendEmailOtp: (email: string, userData?: SignupMeta) => Promise<void>;
  verifyEmailOtp: (email: string, token: string, newPassword?: string) => Promise<void>;
  signUp: (email: string, password: string, userData?: SignupMeta) => Promise<SignUpStatus>;
  signOut: () => Promise<void>;
  fetchUserProfile: () => Promise<void>;
}

/* ========================= Helpers ======================================= */

async function sha256Hex(s: string): Promise<string> {
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

  if (userData.userType === 'Player') return;

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

  if (userData.userType === 'Administrator') {
    const { error } = await supabase.from('admin_users').insert({
      ...base,
      full_name: userData.name,
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

/* =============================== Store =================================== */

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  userProfile: null,
  loading: true,

  /* ----------------------------- PASSWORD SIGN-IN ------------------------- */
  signIn: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    const user = data.user;
    if (!user) throw new Error('Login failed: no user in session');

    if (!user.email_confirmed_at) {
      await supabase.auth.signOut();
      throw new Error('Please verify your email address. Check your inbox for the confirmation code.');
    }

    let profile = await loadUserProfile(user);
    if (!profile) {
      const meta = (user.user_metadata ?? {}) as SignupMeta & { userType?: UserType };
      if (meta.userType && meta.name) {
        const profile_id = await getProfileIdByName(meta.userType);
        await createRoleRowForUser(user, profile_id, {
          userType: meta.userType,
          name: meta.name!,
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
  sendEmailOtp: async (email, userData) => {
    set({ loading: true });
    dbg('otp:send:start', { email, meta: userData });

    // 1) Send OTP via Supabase
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
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
      set({ loading: false });
      throw error;
    }

    // 2) AUDIT: create a "sent" row (no token yet)
    const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || null;
    await supabase.from('email_otp_audit').insert({
      email,
      context: 'email_otp',
      ip: null,            // optionally capture on server via Edge Function
      user_agent: ua,
      status: 'sent',
    });

    set({ loading: false });
  },

  /* ------------------------------- OTP VERIFY ---------------------------- */
  verifyEmailOtp: async (email, token, newPassword) => {
    set({ loading: true });
    dbg('otp:verify:start', { email });

    // Hash token before any storage
    const tokenHash = await sha256Hex(token);
    const tokenLast4 = token.slice(-4);

    // Find the most recent "sent" audit row for this email (no SELECT needed; just update latest)
    // Here we update the latest row by sent_at desc using a Postgres RPC or filter + order.
    // Since we can't order in update, we do: fetch id of latest row, then update it.
    const { data: lastRows } = await supabase
      .from('email_otp_audit')
      .select('id')
      .eq('email', email)
      .order('sent_at', { ascending: false })
      .limit(1);

    const lastId = lastRows?.[0]?.id ?? null;

    if (lastId) {
      // record the attempt before verifying
      await supabase
        .from('email_otp_audit')
        .update({
          token_hash: tokenHash,
          token_last4: tokenLast4,
          attempts: supabase.rpc as any, // dummy to preserve type; we do a separate increment below
        })
        .eq('id', lastId);

      // do a proper attempts++ via RPC to avoid race:
      // create this SQL function once if you like, else ignore and rely on the next update below.
      // For simplicity, we’ll do a second update without RPC:
      await supabase.from('email_otp_audit').update({ attempts: 1 }).eq('id', lastId).lte('attempts', 0);
    } else {
      // If no prior row (edge case), create one with the attempt
      await supabase.from('email_otp_audit').insert({
        email,
        context: 'email_otp',
        token_hash: tokenHash,
        token_last4: tokenLast4,
        attempts: 1,
        status: 'sent',
      });
    }

    // Now verify with Supabase (source of truth)
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'email',
    });

    if (error) {
      // mark failed
      if (lastId) {
        await supabase.from('email_otp_audit').update({ status: 'failed' }).eq('id', lastId);
      }
      set({ loading: false });
      throw error;
    }

    const user = data.user ?? (await supabase.auth.getUser()).data.user ?? null;
    if (!user) {
      if (lastId) {
        await supabase.from('email_otp_audit').update({ status: 'failed' }).eq('id', lastId);
      }
      set({ loading: false });
      throw new Error('Verification succeeded but no user session');
    }

    // Optional password set post-OTP
    if (newPassword) {
      const { error: pwErr } = await supabase.auth.updateUser({ password: newPassword });
      if (pwErr) {
        if (lastId) {
          await supabase.from('email_otp_audit').update({ status: 'failed' }).eq('id', lastId);
        }
        set({ loading: false });
        throw pwErr;
      }
    }

    // Load or provision profile
    let profile = await loadUserProfile(user);
    if (!profile) {
      const meta = (user.user_metadata ?? {}) as SignupMeta & { userType?: UserType };
      if (meta.userType && meta.name && meta.userType !== 'Player') {
        const profile_id = await getProfileIdByName(meta.userType);
        await createRoleRowForUser(user, profile_id, {
          userType: meta.userType,
          name: meta.name!,
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

    // mark validated
    if (lastId) {
      await supabase
        .from('email_otp_audit')
        .update({
          status: 'validated',
          validated_at: new Date().toISOString(),
          user_id: user.id,
        })
        .eq('id', lastId);
    }

    set({ user, userProfile: profile ?? null, loading: false });
  },

  /* ------------------------------ PASSWORD SIGN-UP (optional) ------------ */
  signUp: async (email, password, userData) => {
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
            profile_type: userData?.userType ?? 'Player',
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

      if (!sessionUser) {
        set({ loading: false });
        return 'needs_verification';
      }

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
