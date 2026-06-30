import { useEffect, useState } from 'react';
import { frappe } from '@/lib/frappe';

export interface CompanyDefaults {
  company: string | null;
  currency: string | null;
  country: string | null;
}

/**
 * Reads the default Company from ERPNext and exposes its real
 * default_currency / country, so the UI reflects the backend setup
 * instead of a hardcoded value.
 */
export function useCompanyDefaults() {
  const [defaults, setDefaults] = useState<CompanyDefaults>({
    company: null,
    currency: null,
    country: null,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const companies = await frappe.getList('Company', {
          fields: JSON.stringify(['name', 'default_currency', 'country']),
          limit_page_length: 1,
        });
        const c = Array.isArray(companies) ? companies[0] : undefined;
        if (active && c) {
          setDefaults({
            company: c.name ?? null,
            currency: c.default_currency ?? null,
            country: c.country ?? null,
          });
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return { ...defaults, loading };
}
