import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://example.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'fake_key';

if (supabaseUrl === 'https://example.supabase.co') {
  console.warn('Missing Supabase server environment variables. Using dummy values.');
}

export const supabaseServer = createClient(
  supabaseUrl,
  supabaseServiceKey
);
