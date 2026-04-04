import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// First check what codes exist
const { data: existing } = await sb.from('admin_codes').select('code');
const existingCodes = (existing || []).map((r: any) => r.code);
console.log('Existing codes:', existingCodes);

// Insert only codes that don't exist
const toInsert = [
  { code: 'NEXUS-ADMIN-1234', role: 'Insurer Admin', is_active: true },
].filter(c => !existingCodes.includes(c.code));

if (toInsert.length === 0) {
  console.log('NEXUS-ADMIN-1234 already exists.');
} else {
  const { data, error } = await sb.from('admin_codes').insert(toInsert);
  if (error) {
    console.error('Insert error:', error.message, error.details);
  } else {
    console.log('Inserted successfully:', data);
  }
}

// Confirm final state
const { data: all, error: allErr } = await sb.from('admin_codes').select('*');
console.log('\nFinal admin_codes:', JSON.stringify(all, null, 2));
if (allErr) console.log('Error fetching:', allErr.message);
