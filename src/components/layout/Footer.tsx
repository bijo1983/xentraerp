import React from 'react';
import { useSiteSettings, DEFAULT_SITE_SETTINGS } from '../../hooks/useSiteSettings';

export const Footer: React.FC = () => {
  const { data, isError, error } = useSiteSettings();

  if (isError) {
    console.error('[Footer] Failed to load site settings', error);
  }

  const settings = data ?? DEFAULT_SITE_SETTINGS;

  const poweredByContent = settings.powered_by_line?.trim() ?? '';
  const poweredByLink = settings.powered_by_link?.trim();
  const contactText = settings.contact_text?.trim();
  const contactHref = settings.contact_href?.trim() || (contactText ? `mailto:${contactText}` : undefined);

  const segments: React.ReactNode[] = [settings.copyright_line];

  if (poweredByContent) {
    segments.push(
      poweredByLink ? (
        <a
          href={poweredByLink}
          className="text-primary-500 hover:text-primary-600 transition-colors"
          target="_blank"
          rel="noreferrer"
        >
          {poweredByContent}
        </a>
      ) : (
        poweredByContent
      ),
    );
  }

  if (contactText) {
    segments.push(
      <>
        Contact:{' '}
        {contactHref ? (
          <a
            href={contactHref}
            className="text-primary-500 hover:text-primary-600 transition-colors"
          >
            {contactText}
          </a>
        ) : (
          contactText
        )}
      </>,
    );
  }

  return (
    <footer className="bg-background border-t border-background-subtle">
      <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-center">
          {segments.map((segment, index) => (
            <React.Fragment key={index}>
              {index > 0 && <span className="text-sm text-text-secondary">|</span>}
              <span className="text-sm text-text-secondary flex items-center gap-1">{segment}</span>
            </React.Fragment>
          ))}
        </div>
      </div>
    </footer>
  );
};
