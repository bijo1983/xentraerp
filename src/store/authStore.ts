// ✅ Cleaned and corrected authStore.ts without any JSX
import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';

export type UserProfile = {
  id: string;
  user_id: string;
  type: 'Player' | 'Club' | 'Organizer' | 'Administrator';
  name: string;
  email: string;
  phone_number?: string;
  country_id?: string;
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

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  userProfile: null,
  loading: true,

  signIn: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await get().fetchUserProfile();
  },

  signUp: async (email, password, userData) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error || !data.user) throw error || new Error('Signup failed');

    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('name', userData.userType)
      .single();

    if (profileError || !profileData) throw new Error('Invalid user type');

    const baseUserData = {
      user_id: data.user.id,
      email,
      profile_id: profileData.id,
      phone_number: userData.phone_number || null,
      country_id: userData.country_id || null,
    };

    let insertResponse;
    switch (userData.userType) {
      case 'Player':
        insertResponse = await supabase.from('player_users').insert({
          ...baseUserData,
          full_name: userData.name,
          skill_level: userData.skill_level || 'Beginner',
        }).select();
        break;
      case 'Club':
        insertResponse = await supabase.from('club_users').insert({
          ...baseUserData,
          club_name: userData.name,
          address: userData.address || null,
          website: userData.website || null,
        }).select();
        break;
      case 'Organizer':
        insertResponse = await supabase.from('organizer_users').insert({
          ...baseUserData,
          organizer_name: userData.name,
          company_name: userData.company_name || null,
          website: userData.website || null,
        }).select();
        break;
      default:
        throw new Error('Unhandled user type');
    }

    if (insertResponse.error) throw insertResponse.error;
    await get().fetchUserProfile();
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ user: null, userProfile: null, loading: false });
  },

  fetchUserProfile: async () => {
    const session = await supabase.auth.getSession();
    const user = session.data.session?.user;
    if (!user) {
      set({ user: null, userProfile: null, loading: false });
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from('auth_user_profiles')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (profileError || !profile) {
      set({ user, userProfile: null, loading: false });
      return;
    }

    const fullProfile: UserProfile = {
      id: profile.profile_id,
      user_id: user.id,
      profile_id: profile.profile_id,
      type: profile.profile_type,
      name: '',
      email: '',
    };

    let roleTable = '';
    let nameField = '';
    switch (profile.profile_type) {
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
    }

    if (roleTable) {
      const { data: info } = await supabase
        .from(roleTable)
        .select(`${nameField}, email, phone_number, country_id`)
        .eq('user_id', user.id)
        .single();

      if (info) {
        fullProfile.name = info[nameField];
        fullProfile.email = info.email;
        fullProfile.phone_number = info.phone_number || '';
        fullProfile.country_id = info.country_id || null;
      }
    }

    set({ user, userProfile: fullProfile, loading: false });
  }
}));

// Init listener
supabase.auth.getUser().then(({ data: { user } }) => {
  if (user) {
    useAuthStore.setState({ user, loading: true });
    useAuthStore.getState().fetchUserProfile();
  }
});

supabase.auth.onAuthStateChange((_event, session) => {
  if (session?.user) {
    useAuthStore.setState({ user: session.user, loading: true });
    useAuthStore.getState().fetchUserProfile();
  } else {
    useAuthStore.setState({ user: null, userProfile: null, loading: false });
  }
});
