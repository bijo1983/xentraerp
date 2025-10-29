import React, { useEffect, useMemo } from 'react';
import { applyMetadata, buildMetadata, DEFAULT_SEO, PageMetadataConfig } from '../../lib/seo';

export type PageMetadataProps = Partial<PageMetadataConfig>;

export const DefaultSeo: React.FC = () => {
  useEffect(() => {
    applyMetadata(DEFAULT_SEO);
  }, []);

  return null;
};

export const PageMetadata: React.FC<PageMetadataProps> = (props) => {
  const propsKey = JSON.stringify(props);
  const metadata = useMemo(() => buildMetadata(props), [propsKey]);

  useEffect(() => {
    applyMetadata(metadata);

    return () => {
      applyMetadata(DEFAULT_SEO);
    };
  }, [metadata]);

  return null;
};
