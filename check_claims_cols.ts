import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function checkTables() {
  const { data: claims, error: ce } = await supabase.from('claims').select('*').limit(1);
  const { data: txns, error: te } = await supabase.from('transactions').select('*').limit(1);
  console.log("CLAIMS_COLUMNS_START");
  console.log(JSON.stringify(Object.keys(claims?.[0] || {}), null, 2));
  console.log("CLAIMS_COLUMNS_END");
  console.log("TXNS_COLUMNS_START");
  console.log(JSON.stringify(Object.keys(txns?.[0] || {}), null, 2));
  console.log("TXNS_COLUMNS_END");
}

checkTables();
