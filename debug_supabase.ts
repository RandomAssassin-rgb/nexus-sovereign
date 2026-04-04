import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const sb = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function check() {
  const log: string[] = [];
  log.push("=== SCHEMA DISCOVERY ===\n");

  // Get all columns for users table
  const { data: userCols } = await sb.from('users').select('*').limit(1);
  log.push("USERS SAMPLE: " + JSON.stringify(userCols, null, 2));
  
  // Try without .id
  const { data: users2, error: ue2 } = await sb.from('users').select('*').limit(3);
  log.push("\nUSERS (select *): " + JSON.stringify(users2, null, 2));
  log.push("USERS ERROR: " + JSON.stringify(ue2));

  // Check claims with select *
  const { data: claims, error: ce } = await sb.from('claims').select('*').limit(3);
  log.push("\nCLAIMS (select *): " + JSON.stringify(claims, null, 2));
  log.push("CLAIMS ERROR: " + JSON.stringify(ce));

  // Check the actual transactions table name
  const { data: txns, error: te } = await sb.from('transactions').select('*').limit(3);
  log.push("\nTRANSACTIONS (select *): " + JSON.stringify(txns, null, 2));
  log.push("TRANSACTIONS ERROR: " + JSON.stringify(te));

  // Also check if there's an alternate wallet table
  const { data: wt, error: we } = await sb.from('wallet').select('*').limit(3);
  log.push("\nWALLET (select *): " + JSON.stringify(wt, null, 2));
  log.push("WALLET ERROR: " + JSON.stringify(we));

  const output = log.join('\n');
  fs.writeFileSync('debug_output.txt', output);
  console.log('Done. Check debug_output.txt');
}

check().catch(e => {
  fs.writeFileSync('debug_output.txt', `FATAL: ${e.message}\n${e.stack}`);
  console.log('Error -> debug_output.txt');
});
