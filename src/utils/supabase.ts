import { createClient } from '@supabase/supabase-js';

// ⚠️ Replace these with your actual Supabase project values
// 1. Go to https://supabase.com → New Project (free tier)
// 2. Copy the URL and anon key from Settings → API
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'YOUR_SUPABASE_ANON_KEY';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
