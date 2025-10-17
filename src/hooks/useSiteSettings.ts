import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export type SiteSettings = {
  slug: string;
  copyright_line: string;
  powered_by_line: string | null;
  powered_by_link: string | null;
  contact_text: string | null;
  contact_href: string | null;
  updated_at: string | null;
  updated_by: string | null;
};

export type SiteSettingsUpdateInput = {
  copyright_line: string;
  powered_by_line: string | null;
  powered_by_link: string | null;
  contact_text: string | null;
  contact_href: string | null;
};

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  slug: 'footer',
  copyright_line: '© 2025 Badminton Booking. All rights reserved.',
  powered_by_line: 'Powered by Innovegic Consultancy and IT Services Co W.L.L.',
  powered_by_link: null,
  contact_text: 'info@innovegict.com',
  contact_href: 'mailto:info@innovegict.com',
  updated_at: null,
  updated_by: null,
};

const SITE_SETTINGS_QUERY_KEY = ['site-settings', 'footer'] as const;

const shouldFallbackToDefault = (status?: number, error?: unknown): boolean => {
  if (status && [401, 403, 404].includes(status)) {
    return true;
  }

  const maybeError = (error ?? {}) as { code?: string; message?: string };
  const code = maybeError.code ?? '';
  if (code === 'PGRST116' || code === '42501' || code === 'PGRST301' || code === 'PGRST302') {
    return true;
  }

  const message = maybeError.message ?? '';
  if (typeof message === 'string') {
    return /permission denied|forbidden|not found|does not exist/i.test(message);
  }

  return false;
};

const fetchSiteSettings = async (): Promise<SiteSettings> => {
  try {
    const { data, error, status } = await supabase
      .from('site_settings')
      .select('*')
      .eq('slug', 'footer')
      .maybeSingle();

    if (error) {
      if (shouldFallbackToDefault(status, error)) {
        console.warn('[useSiteSettings] Falling back to default footer settings.', { status, error });
        return DEFAULT_SITE_SETTINGS;
      }

      throw error;
    }

    if (!data) {
      return DEFAULT_SITE_SETTINGS;
    }

    return data as SiteSettings;
  } catch (err: unknown) {
    const maybeStatus = (err as { status?: number } | null | undefined)?.status;
    const status = typeof maybeStatus === 'number' ? maybeStatus : undefined;

    if (shouldFallbackToDefault(status, err)) {
      console.warn('[useSiteSettings] Unexpected error, using default footer settings.', err);
      return DEFAULT_SITE_SETTINGS;
    }

    throw err;
  }
};

export const useSiteSettings = () => {
  return useQuery({
    queryKey: SITE_SETTINGS_QUERY_KEY,
    queryFn: fetchSiteSettings,
  });
};

export const useUpdateSiteSettings = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: SiteSettingsUpdateInput) => {
      const { data, error } = await supabase
        .from('site_settings')
        .update({
          copyright_line: input.copyright_line,
          powered_by_line: input.powered_by_line,
          powered_by_link: input.powered_by_link,
          contact_text: input.contact_text,
          contact_href: input.contact_href,
        })
        .eq('slug', 'footer')
        .select('*')
        .single();

      if (error) {
        throw error;
      }

      return data as SiteSettings;
    },
    onSuccess: data => {
      queryClient.setQueryData(SITE_SETTINGS_QUERY_KEY, data);
    },
  });
};
