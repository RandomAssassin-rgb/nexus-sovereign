import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Drop the foreign key constraint and add missing columns
const sql = `
-- Drop FK constraint so admin_code is free-form
ALTER TABLE admin_users DROP CONSTRAINT IF EXISTS admin_users_admin_code_fkey;

-- Ensure all required columns exist
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS aadhaar_number VARCHAR(20);
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS aadhaar_verified BOOLEAN DEFAULT false;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS biometric_verified BOOLEAN DEFAULT false;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS face_descriptor TEXT;
`;

// Execute via RPC (raw SQL)
const { error } = await sb.rpc('exec_sql', { sql });
if (error) {
  // Fall back — try each statement
  process.stdout.write('RPC failed, trying pg approach: ' + error.message + '\n');
} else {
  process.stdout.write('Migration successful\n');
}
