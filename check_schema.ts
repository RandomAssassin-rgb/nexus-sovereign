import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function checkSchema() {
  const { data, error } = await supabase.rpc('get_column_info', { t_name: 'users', c_name: 'premium_until' });
  if (error) {
    // If RPC doesn't exist, try a simple select
    const { data: selectData, error: selectError } = await supabase.from('users').select('premium_until').limit(1);
    if (selectError) {
      console.error("Schema Verification Failed:", selectError.message);
    } else {
      console.log("Success: 'premium_until' column IS present.");
    }
  } else {
    console.log("Column Info:", data);
  }
}
checkSchema();
