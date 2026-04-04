import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Keep local Vercel functions aligned with the frontend/server dev env loading.
dotenv.config({ path: '.env.local', quiet: true });
dotenv.config({ quiet: true });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://example.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'fake_key';

if (!supabaseUrl || supabaseUrl === 'https://example.supabase.co') {
  console.warn('[Vercel] Missing Supabase environment variables.');
}

export const supabaseServer = createClient(
  supabaseUrl,
  supabaseServiceKey
);
