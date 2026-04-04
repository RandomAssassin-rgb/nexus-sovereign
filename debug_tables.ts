import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function debugTables() {
  const { data, error } = await supabase.from('users').select('*').limit(1);
  if (error) {
    console.error("Error direct select:", error.message);
    const { data: listData, error: listError } = await supabase.rpc('exec_sql', { sql_query: "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'" });
    if (listError) {
      console.error("Error listing tables via RPC:", listError.message);
    } else {
      console.log("Visible tables in 'public':", listData);
    }
  } else {
    console.log("Direct select successful. Table 'users' IS visible.");
  }
}
debugTables();
