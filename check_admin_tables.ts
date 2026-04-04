import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Check if admin_codes table exists and what's in it
const { data: codes, error: codesErr } = await sb.from('admin_codes').select('*');
console.log('admin_codes rows:', JSON.stringify(codes));
console.log('admin_codes error:', JSON.stringify(codesErr));

// Check admin_users table structure
const { data: users, error: usersErr } = await sb.from('admin_users').select('*').limit(5);
console.log('\nadmin_users rows:', JSON.stringify(users));
console.log('admin_users error:', JSON.stringify(usersErr));
