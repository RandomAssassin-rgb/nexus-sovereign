import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';
import * as bcrypt from 'bcryptjs';

const sb = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Simulate the signup flow
const admin_code = 'NEXUS-ADMIN-1234';
const password = 'TestPass1!';

// Step 1: check code
const { data: codeData, error: codeErr } = await sb
  .from('admin_codes').select('*').eq('code', admin_code.trim()).single();
process.stdout.write('Code lookup: ' + JSON.stringify({ codeData, codeErr }) + '\n');

if (codeData) {
  // Step 2: hash password
  const password_hash = await bcrypt.hash(password, 12);
  process.stdout.write('Password hashed OK\n');

  // Step 3: insert user
  const { data: user, error: userErr } = await sb
    .from('admin_users')
    .insert([{ admin_code: admin_code.trim(), role: codeData.role, password_hash }])
    .select('id, role, admin_code')
    .single();
  process.stdout.write('User insert: ' + JSON.stringify({ user, userErr }) + '\n');
}
