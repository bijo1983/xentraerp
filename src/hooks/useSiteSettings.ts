import React from 'react';
import { supabase } from '../lib/supabase';

export type SiteSettings = {
  slug: string;
  copyright_line: string | null;
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

type SiteSettingsContextValue = {
  data: SiteSettings;
  setData: React.Dispatch<React.SetStateAction<SiteSettings>>;
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
  refetch: () => Promise<SiteSettings>;
};

const SiteSettingsContext = React.createContext<SiteSettingsContextValue | null>(null);

export const SiteSettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [data, setDataState] = React.useState<SiteSettings>(DEFAULT_SITE_SETTINGS);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isFetching, setIsFetching] = React.useState(false);
  const [error, setError] = React.useState<Error | null>(null);
  const isMountedRef = React.useRef(true);
  const latestDataRef = React.useRef<SiteSettings>(DEFAULT_SITE_SETTINGS);

  const setData = React.useCallback((value: React.SetStateAction<SiteSettings>) => {
    setDataState(prev => {
      const next = typeof value === 'function' ? (value as (previous: SiteSettings) => SiteSettings)(prev) : value;
      latestDataRef.current = next;
      return next;
    });
  }, []);

  React.useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadSettings = React.useCallback(async () => {
    if (!isMountedRef.current) {
      return latestDataRef.current;
    }

    setIsFetching(true);

    try {
      const settings = await fetchSiteSettings();
      if (!isMountedRef.current) {
        return settings;
      }

      setData(settings);
      setError(null);
      return settings;
    } catch (err) {
      const normalizedError = err instanceof Error ? err : new Error('Failed to load site settings.');

      if (isMountedRef.current) {
        setError(normalizedError);
        console.error('[SiteSettingsProvider] Failed to fetch site settings', err);
      }

      return latestDataRef.current;
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
        setIsFetching(false);
      }
    }
  }, []);

  React.useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const refetch = React.useCallback(async () => {
    return loadSettings();
  }, [loadSettings]);

  const value = React.useMemo<SiteSettingsContextValue>(
    () => ({
      data,
      setData,
      isLoading,
      isFetching,
      error,
      refetch,
    }),
    [data, isLoading, isFetching, error, refetch],
  );

  return <SiteSettingsContext.Provider value={value}>{children}</SiteSettingsContext.Provider>;
};

const useSiteSettingsContext = () => {
  const context = React.useContext(SiteSettingsContext);

  if (!context) {
    throw new Error('useSiteSettings must be used within a SiteSettingsProvider');
  }

  return context;
};

export const useSiteSettings = () => {
  const { data, isLoading, isFetching, error, refetch } = useSiteSettingsContext();

  return {
    data,
    isLoading,
    isFetching,
    error,
    isError: Boolean(error),
    refetch,
  };
};

export const useUpdateSiteSettings = () => {
  const { setData } = useSiteSettingsContext();
  const [isPending, setIsPending] = React.useState(false);

  const mutateAsync = React.useCallback(
    async (input: SiteSettingsUpdateInput) => {
      setIsPending(true);

      try {
        const { data: updatedData, error } = await supabase
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

        const siteSettings = (updatedData as SiteSettings | null) ?? DEFAULT_SITE_SETTINGS;
        setData(siteSettings);
        return siteSettings;
      } finally {
        setIsPending(false);
      }
    },
    [setData],
  );

  return {
    isPending,
    mutateAsync,
  };
};
