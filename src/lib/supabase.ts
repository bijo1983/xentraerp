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

export const supabase = createClient(supabaseUrl, supabaseAnonKey)