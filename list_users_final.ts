import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function run() {
  console.log("--- FINAL DATABASE CHECK ---");
  
  // 1. List Users
  const { data: users, error: uErr } = await supabase.from('users').select('*');
  if (uErr) console.error("Users Error:", uErr.message);
  else {
    console.log(`\nFound ${users.length} users:`);
    console.log(JSON.stringify(users, null, 2));
  }

  // 2. Check Claims Schema (actually inspect a row if exists)
  const { data: claims } = await supabase.from('claims').select('*').limit(1);
  if (claims && claims.length > 0) {
    console.log("\nClaims structure:", Object.keys(claims[0]));
  } else {
    console.log("\nNo claims found to inspect structure.");
  }

  // 3. Check Transactions Schema
  const { data: txns } = await supabase.from('transactions').select('*').limit(1);
  if (txns && txns.length > 0) {
    console.log("\nTransactions structure:", Object.keys(txns[0]));
  }
}

run();
