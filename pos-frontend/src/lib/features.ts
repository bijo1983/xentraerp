// Feature switches for work that lands in later phases. Kept in one place so a phase can
// ship dark and be switched on deliberately.
export const FEATURES = {
  /** Phase 2 (owner decision D6): per-tenant VAT settings — "Tax & VAT" in settings. */
  taxVat: false,
} as const
