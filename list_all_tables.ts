import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function checkAllTables() {
  console.log("🕵️ Checking database schema for Nexus Sovereign...");
  const { data, error } = await supabase.rpc('execute_sql', { 
    query: "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'" 
  });
  
  if (error) {
    console.error("❌ SQL Fetch Error:", error.message);
  } else {
    console.log("Existing Tables:", data.map((t: any) => t.table_name).join(", "));
  }
}
checkAllTables();
