import React from 'react';
import { Loader2, RefreshCw, Save, RotateCcw } from 'lucide-react';
import {
  useSiteSettings,
  useUpdateSiteSettings,
  DEFAULT_SITE_SETTINGS,
  SiteSettings,
  SiteSettingsUpdateInput,
} from '../../hooks/useSiteSettings';

const toFormState = (settings: SiteSettings) => ({
  copyright_line: settings.copyright_line ?? '',
  powered_by_line: settings.powered_by_line ?? '',
  powered_by_link: settings.powered_by_link ?? '',
  contact_text: settings.contact_text ?? '',
  contact_href: settings.contact_href ?? '',
});

type SiteSettingsFormState = ReturnType<typeof toFormState>;

const normalizeFormState = (values: SiteSettingsFormState): SiteSettingsUpdateInput => {
  const copyright = (values.copyright_line ?? '').trim();
  const poweredByLine = (values.powered_by_line ?? '').trim();
  const poweredByLink = (values.powered_by_link ?? '').trim();
  const contactText = (values.contact_text ?? '').trim();
  let contactHref = (values.contact_href ?? '').trim();

  if (!contactHref && contactText) {
    if (contactText.startsWith('http://') || contactText.startsWith('https://')) {
      contactHref = contactText;
    } else if (contactText.includes('@')) {
      contactHref = `mailto:${contactText}`;
    }
  }

  return {
    copyright_line: copyright,
    powered_by_line: poweredByLine || null,
    powered_by_link: poweredByLink || null,
    contact_text: contactText || null,
    contact_href: contactHref || null,
  };
};

const displayUpdatedAt = (settings: SiteSettings | undefined) => {
  if (!settings?.updated_at) {
    return 'Not set yet';
  }

  try {
    return new Date(settings.updated_at).toLocaleString();
  } catch (error) {
    console.warn('[SiteSettingsManager] Failed to parse updated_at', error);
    return settings.updated_at;
  }
};

export const SiteSettingsManager: React.FC = () => {
  const { data, isLoading, isFetching, refetch } = useSiteSettings();
  const updateMutation = useUpdateSiteSettings();
  const [formState, setFormState] = React.useState<SiteSettingsFormState>(() =>
    toFormState(DEFAULT_SITE_SETTINGS),
  );
  const [feedback, setFeedback] = React.useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const baselineForm = React.useMemo(
    () => toFormState(data ?? DEFAULT_SITE_SETTINGS),
    [data],
  );

  React.useEffect(() => {
    setFormState(baselineForm);
  }, [baselineForm]);

  const hasChanges = React.useMemo(() => {
    return (
      JSON.stringify(normalizeFormState(formState)) !==
      JSON.stringify(normalizeFormState(baselineForm))
    );
  }, [formState, baselineForm]);

  React.useEffect(() => {
    if (!feedback) return;

    const timeout = window.setTimeout(() => setFeedback(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [feedback]);

  const handleChange = (
    field: keyof SiteSettingsFormState,
    value: string,
  ) => {
    setFormState(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback(null);

    const payload = normalizeFormState(formState);

    if (!payload.copyright_line) {
      setFeedback({
        type: 'error',
        message: 'Copyright line is required.',
      });
      return;
    }

    try {
      await updateMutation.mutateAsync(payload);
      setFeedback({ type: 'success', message: 'Footer details saved successfully.' });
    } catch (err) {
      console.error('[SiteSettingsManager] Failed to save settings', err);
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to save settings.',
      });
    }
  };

  const handleReset = () => {
    setFormState(baselineForm);
    setFeedback(null);
  };

  const handleRefresh = async () => {
    setFeedback(null);
    await refetch();
  };

  return (
    <section className="bg-white border border-gray-200 rounded-2xl shadow-sm">
      <div className="border-b border-gray-200 px-4 sm:px-6 py-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Platform footer</h2>
          <p className="text-sm text-gray-500">
            Control the copyright and contact details displayed on every page.
          </p>
        </div>
        <div className="text-sm text-gray-500 bg-gray-50 px-3 py-2 rounded-lg border border-gray-200">
          Last updated: {displayUpdatedAt(data ?? undefined)}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-5">
        {feedback && (
          <div
            className={`px-4 py-3 rounded-lg border text-sm ${
              feedback.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : 'bg-rose-50 border-rose-200 text-rose-700'
            }`}
          >
            {feedback.message}
          </div>
        )}

        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700" htmlFor="copyright_line">
            Copyright line
          </label>
          <textarea
            id="copyright_line"
            required
            value={formState.copyright_line}
            onChange={event => handleChange('copyright_line', event.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            rows={2}
          />
          <p className="text-xs text-gray-500">
            Example: © 2025 Badminton Booking. All rights reserved.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700" htmlFor="powered_by_line">
              Powered by text
            </label>
            <input
              id="powered_by_line"
              type="text"
              value={formState.powered_by_line}
              onChange={event => handleChange('powered_by_line', event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="Powered by Innovegic Consultancy and IT Services Co W.L.L."
            />
          </div>

          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700" htmlFor="powered_by_link">
              Powered by link (optional)
            </label>
            <input
              id="powered_by_link"
              type="url"
              value={formState.powered_by_link}
              onChange={event => handleChange('powered_by_link', event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="https://innovegict.com"
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700" htmlFor="contact_text">
              Contact text
            </label>
            <input
              id="contact_text"
              type="text"
              value={formState.contact_text}
              onChange={event => handleChange('contact_text', event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="info@innovegict.com"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700" htmlFor="contact_href">
              Contact link (optional)
            </label>
            <input
              id="contact_href"
              type="url"
              value={formState.contact_href}
              onChange={event => handleChange('contact_href', event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="mailto:info@innovegict.com"
            />
            <p className="text-xs text-gray-500">
              Leave blank to automatically link to the email address above.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={!hasChanges || updateMutation.isPending}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors ${
              !hasChanges || updateMutation.isPending
                ? 'bg-emerald-400 cursor-not-allowed'
                : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
          >
            {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save changes
          </button>

          <button
            type="button"
            onClick={handleReset}
            disabled={!hasChanges || updateMutation.isPending}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium border transition-colors ${
              !hasChanges || updateMutation.isPending
                ? 'border-gray-200 text-gray-400 cursor-not-allowed'
                : 'border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <RotateCcw className="h-4 w-4" />
            Reset
          </button>

          <button
            type="button"
            onClick={() => void handleRefresh()}
            disabled={isFetching}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </button>
        </div>
      </form>

      {isLoading && (
        <div className="px-4 pb-4 text-sm text-gray-500 flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading site settings...
        </div>
      )}
    </section>
  );
};
