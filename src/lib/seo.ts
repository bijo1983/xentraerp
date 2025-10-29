export interface StructuredDataEntry {
  [key: string]: unknown;
}

export type StructuredData = StructuredDataEntry | StructuredDataEntry[];

export interface PageMetadataConfig {
  title: string;
  description: string;
  keywords: string[];
  path?: string;
  canonical?: string;
  image?: string;
  type?: string;
  noIndex?: boolean;
  twitterCard?: 'summary' | 'summary_large_image';
  siteName?: string;
  structuredData?: StructuredDataEntry[];
}

export const SITE_NAME = 'Badminton Booking Platform';
export const SITE_URL = 'https://badmintonbooking.com';

const DEFAULT_IMAGE = `${SITE_URL}/brand/social-card.png`;

const DEFAULT_KEYWORDS = [
  'badminton booking platform',
  'badminton court reservation system',
  'sports facility management software',
  'badminton tournament software',
  'court scheduling tool',
  'club membership management',
  'badminton club software',
  'online badminton booking',
];

const BASE_STRUCTURED_DATA: StructuredDataEntry[] = [
  {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: SITE_URL,
    description:
      'Badminton Booking is an end-to-end platform for managing badminton clubs, courts, tournaments, and player communities.',
    logo: `${SITE_URL}/brand/logo.svg`,
    sameAs: [
      'https://www.facebook.com/',
      'https://www.instagram.com/',
      'https://www.linkedin.com/',
    ],
  },
];

const BASE_METADATA: PageMetadataConfig = {
  title: 'Badminton Booking & Tournament Platform',
  description:
    'Badminton Booking is an all-in-one badminton club management platform that powers online court reservations, tournament scheduling, membership tracking, and community engagement.',
  keywords: DEFAULT_KEYWORDS,
  path: '/',
  canonical: `${SITE_URL}/`,
  image: DEFAULT_IMAGE,
  type: 'website',
  noIndex: false,
  twitterCard: 'summary_large_image',
  siteName: SITE_NAME,
  structuredData: BASE_STRUCTURED_DATA,
};

const toStructuredArray = (data?: StructuredData): StructuredDataEntry[] => {
  if (!data) return [];
  return Array.isArray(data) ? data : [data];
};

const uniqueKeywords = (keywords: string[]): string[] => {
  const seen = new Set<string>();
  return keywords
    .map(keyword => keyword.trim())
    .filter((keyword) => {
      if (!keyword) return false;
      const lower = keyword.toLowerCase();
      if (seen.has(lower)) return false;
      seen.add(lower);
      return true;
    });
};

export const buildMetadata = (overrides: Partial<PageMetadataConfig>): PageMetadataConfig => {
  const path = overrides.path ?? BASE_METADATA.path;
  const canonical = overrides.canonical ?? (path ? new URL(path, SITE_URL).toString() : BASE_METADATA.canonical);
  const keywords = uniqueKeywords(overrides.keywords ?? BASE_METADATA.keywords);
  const image = overrides.image ?? BASE_METADATA.image ?? DEFAULT_IMAGE;
  const structuredData = toStructuredArray(BASE_METADATA.structuredData);
  const overrideStructuredData = toStructuredArray(overrides.structuredData);

  return {
    ...BASE_METADATA,
    ...overrides,
    keywords,
    path,
    canonical,
    image,
    structuredData: overrideStructuredData.length > 0 ? [...structuredData, ...overrideStructuredData] : structuredData,
    noIndex: overrides.noIndex ?? BASE_METADATA.noIndex,
    type: overrides.type ?? BASE_METADATA.type,
    twitterCard: overrides.twitterCard ?? BASE_METADATA.twitterCard,
    siteName: overrides.siteName ?? BASE_METADATA.siteName,
  };
};

export const DEFAULT_SEO = buildMetadata({});

const setMetaTag = (selector: string, attributes: Record<string, string>, value: string | undefined | null) => {
  if (typeof document === 'undefined' || value === undefined || value === null) return;
  let element = document.head.querySelector(selector) as HTMLMetaElement | null;

  if (!element) {
    element = document.createElement('meta');
    Object.entries(attributes).forEach(([key, attrValue]) => element?.setAttribute(key, attrValue));
    document.head.appendChild(element);
  }

  element.setAttribute('content', value);
};

const removeMetaTagContent = (selector: string) => {
  if (typeof document === 'undefined') return;
  const element = document.head.querySelector(selector) as HTMLMetaElement | null;
  if (element) {
    element.removeAttribute('content');
  }
};

const setLinkTag = (selector: string, attributes: Record<string, string>, href: string | undefined | null) => {
  if (typeof document === 'undefined' || !href) return;
  let element = document.head.querySelector(selector) as HTMLLinkElement | null;

  if (!element) {
    element = document.createElement('link');
    Object.entries(attributes).forEach(([key, attrValue]) => element?.setAttribute(key, attrValue));
    document.head.appendChild(element);
  }

  element.setAttribute('href', href);
};

const removeLinkTag = (selector: string) => {
  if (typeof document === 'undefined') return;
  const element = document.head.querySelector(selector) as HTMLLinkElement | null;
  if (element) {
    element.removeAttribute('href');
  }
};

const STRUCTURED_DATA_ID = 'seo-structured-data';

export const applyMetadata = (metadata: PageMetadataConfig) => {
  if (typeof document === 'undefined') return;

  document.title = metadata.title;

  const robotsValue = metadata.noIndex ? 'noindex, nofollow' : 'index, follow';

  setMetaTag('meta[name="description"]', { name: 'description' }, metadata.description);
  setMetaTag('meta[name="keywords"]', { name: 'keywords' }, metadata.keywords.join(', '));
  setMetaTag('meta[name="robots"]', { name: 'robots' }, robotsValue);
  setMetaTag('meta[name="googlebot"]', { name: 'googlebot' }, robotsValue);
  setMetaTag('meta[property="og:title"]', { property: 'og:title' }, metadata.title);
  setMetaTag('meta[property="og:description"]', { property: 'og:description' }, metadata.description);
  setMetaTag('meta[property="og:type"]', { property: 'og:type' }, metadata.type ?? 'website');
  setMetaTag('meta[property="og:url"]', { property: 'og:url' }, metadata.canonical);
  setMetaTag('meta[property="og:site_name"]', { property: 'og:site_name' }, metadata.siteName ?? SITE_NAME);

  if (metadata.image) {
    setMetaTag('meta[property="og:image"]', { property: 'og:image' }, metadata.image);
    setMetaTag('meta[name="twitter:image"]', { name: 'twitter:image' }, metadata.image);
  }

  setMetaTag('meta[name="twitter:card"]', { name: 'twitter:card' }, metadata.twitterCard ?? 'summary_large_image');
  setMetaTag('meta[name="twitter:title"]', { name: 'twitter:title' }, metadata.title);
  setMetaTag('meta[name="twitter:description"]', { name: 'twitter:description' }, metadata.description);
  setMetaTag('meta[name="author"]', { name: 'author' }, SITE_NAME);

  if (metadata.canonical) {
    setLinkTag('link[rel="canonical"]', { rel: 'canonical' }, metadata.canonical);
  } else {
    removeLinkTag('link[rel="canonical"]');
  }

  const structuredData = toStructuredArray(metadata.structuredData);
  const existingScript = document.head.querySelector(`#${STRUCTURED_DATA_ID}`) as HTMLScriptElement | null;

  if (structuredData.length > 0) {
    const scriptContent = structuredData.length === 1 ? structuredData[0] : structuredData;
    let scriptTag = existingScript;
    if (!scriptTag) {
      scriptTag = document.createElement('script');
      scriptTag.type = 'application/ld+json';
      scriptTag.id = STRUCTURED_DATA_ID;
      document.head.appendChild(scriptTag);
    }
    scriptTag.textContent = JSON.stringify(scriptContent, null, 2);
  } else if (existingScript) {
    existingScript.remove();
  }
};

export const clearMetadata = () => {
  if (typeof document === 'undefined') return;
  removeMetaTagContent('meta[name="description"]');
  removeMetaTagContent('meta[name="keywords"]');
  removeMetaTagContent('meta[name="robots"]');
  removeMetaTagContent('meta[name="googlebot"]');
  removeMetaTagContent('meta[property="og:title"]');
  removeMetaTagContent('meta[property="og:description"]');
  removeMetaTagContent('meta[property="og:type"]');
  removeMetaTagContent('meta[property="og:url"]');
  removeMetaTagContent('meta[property="og:site_name"]');
  removeMetaTagContent('meta[property="og:image"]');
  removeMetaTagContent('meta[name="twitter:card"]');
  removeMetaTagContent('meta[name="twitter:title"]');
  removeMetaTagContent('meta[name="twitter:description"]');
  removeMetaTagContent('meta[name="twitter:image"]');
  removeMetaTagContent('meta[name="author"]');
  removeLinkTag('link[rel="canonical"]');

  const existingScript = document.head.querySelector(`#${STRUCTURED_DATA_ID}`);
  if (existingScript) {
    existingScript.remove();
  }
};
