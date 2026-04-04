import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const { data, error } = await sb.from('admin_codes').select('*');
if (error) {
  process.stdout.write('ERROR: ' + error.message + '\n');
} else {
  process.stdout.write('CODES:\n');
  for (const row of data || []) {
    process.stdout.write(`  code=${row.code} role=${row.role} active=${row.is_active}\n`);
  }
}
