// FILE: src/lib/supabase.ts
// Single source of truth for Supabase client (Vite + React).
// Reads URL/Anon Key from env. Configure in Netlify → Environment variables.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// Fail fast with clear guidance (prevents silent misconfig in prod)
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    [
      'Missing Supabase env vars.',
      'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment (Netlify → Site settings → Build & deploy → Environment).',
    ].join(' ')
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true }, // keep user sessions across reloads
});

export default supabase;
