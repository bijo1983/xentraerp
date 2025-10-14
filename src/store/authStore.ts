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

// cache profile ids once fetched
const profileIdCache = new Map<string, string>();

async function getProfileIdByName(name: 'Player' | 'Club' | 'Organizer' | 'Administrator'): Promise<string> {
  const cached = profileIdCache.get(name);
  if (cached) return cached;

  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('name', name)
    .maybeSingle();

  if (error || !data) throw new Error(`Could not fetch profile_id for "${name}".`);

  profileIdCache.set(name, data.id);
  return data.id;
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
) {
  const base = {
    user_id: user.id, // if you added a trigger to set this, you can omit it
    profile_id,       // ✅ REQUIRED by your schema
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

async function loadUserProfile(user: User): Promise<UserProfile | null> {
  const { data: profileRow, error: profileErr } = await supabase
    .from('auth_user_profiles')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (profileErr) throw profileErr;
  if (!profileRow) return null;

  const profileType: UserProfile['type'] = profileRow.profile_type;

  let roleTable = '';
  let nameField = '';
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

  const { data: info } = await supabase
    .from(roleTable)
    .select(`${nameField}, email, phone_number, country_id`)
    .eq('user_id', user.id)
    .maybeSingle();

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

    // Try to load profile; if missing, build from metadata (first login after confirmation)
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

  signUp: async (email, password, userData) => {
    // store metadata so we can finish provisioning after email confirmation
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

    // If confirmation is disabled and we already have a session, we can create the role row now.
    const sessionUser = data.user;
    if (sessionUser) {
      const profile_id = await getProfileIdByName(userData.userType);
      await createRoleRowForUser(sessionUser, profile_id, {
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
      set({
