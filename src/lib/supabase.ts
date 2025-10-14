import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://ikadkbzaeqqtamnkgowu.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlrYWRrYnphZXFxdGFtbmtnb3d1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk3MzM5OTgsImV4cCI6MjA2NTMwOTk5OH0.k3pPH-2VIqahL_mJNz8DLAHT9WOPAJNRDrkazYpskTE'

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing Supabase environment variables!')
  console.error('Please set up your Supabase connection:')
  console.error('1. Go to https://supabase.com and create a new project')
  console.error('2. Copy your project URL and anon key')
  console.error('3. Click the "Connect to Supabase" button in the top right')
  console.error('4. Or create a .env file with:')
  console.error('   VITE_SUPABASE_URL=your_project_url')
  console.error('   VITE_SUPABASE_ANON_KEY=your_anon_key')
}

console.log("🔧 Supabase init", { url: supabaseUrl, keyPresent: !!supabaseAnonKey });
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: async (input, init) => {
      try {
        const method = (init && init.method) || 'GET';
        const url = typeof input === 'string' ? input : (input && input.url) || 'unknown';
        const headers = (init && init.headers) || {};
        const safeHeaders = {};
        // scrub secrets but show presence
        if (headers) {
          for (const [k, v] of Object.entries(headers)) {
            if (typeof v === 'string') {
              safeHeaders[k] = (k.toLowerCase().includes('authorization') || k.toLowerCase()==='apikey')
                ? `present(len=${v.length})`
                : v;
            } else {
              safeHeaders[k] = v;
            }
          }
        }
        console.log("🌐 Supabase OUT", { method, url, headers: safeHeaders });
      } catch (e) {
        console.warn("🌐 Supabase OUT (log failed)", e);
      }
      const res = await fetch(input, init);
      try {
        const ct = res.headers.get('content-type') || '';
        const bodyPreview = ct.includes('application/json') ? await res.clone().text() : `<${ct}>`;
        console.log("🌐 Supabase IN", { status: res.status, url: typeof input==='string'?input:(input&&input.url)||'unknown', sb_request_id: res.headers.get('sb-request-id') || res.headers.get('x-request-id') || res.headers.get('x-kong-request-id') || null, headers: Object.fromEntries(res.headers.entries()), bodyPreview: bodyPreview?.slice(0, 500) });
      } catch (e) {
        console.warn("🌐 Supabase IN (log failed)", e);
      }
      return res;
    }
  }
})
