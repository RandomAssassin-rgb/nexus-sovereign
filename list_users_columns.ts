import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function getFullSchema() {
  console.log("🕵️ Auditing COMPLETE Users Schema...");
  const { data, error } = await supabase.rpc('execute_sql', { 
    query: "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'users' AND table_schema = 'public'" 
  });
  
  if (error) {
    console.error("❌ SQL Fetch Error:", error.message);
  } else {
    console.log("Existing Columns in 'users':");
    data.forEach((c: any) => console.log(` - ${c.column_name} (${c.data_type})`));
  }
}
getFullSchema();
