import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Get all rows to see column names
const { data, error } = await sb.from('admin_users').select('*');
if (error) {
  process.stdout.write('Error: ' + error.message + '\n');
} else {
  const cols = data && data.length > 0 ? Object.keys(data[0]) : [];
  process.stdout.write('Columns: ' + cols.join(', ') + '\n');
  process.stdout.write('Row count: ' + (data?.length ?? 0) + '\n');
}

// Try inserting a test row with face_descriptor to see if column exists
const { error: insertErr } = await sb.from('admin_users').insert([{
  admin_code: 'TEST-CHECK',
  role: 'test',
  password_hash: 'x',
  face_descriptor: '[1,2,3]',
}]);
if (insertErr) {
  process.stdout.write('Insert test error: ' + insertErr.message + '\n');
} else {
  // Clean up
  await sb.from('admin_users').delete().eq('admin_code', 'TEST-CHECK');
  process.stdout.write('face_descriptor column: OK\n');
}
