import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function run() {
  console.log("--- START DATABASE DIAGNOSTIC ---");
  const tables = ['users', 'claims', 'transactions'];
  
  for (const table of tables) {
    console.log(`\nTable: ${table}`);
    const { data, error } = await supabase.rpc('exec_sql', { 
      sql_query: `SELECT column_name, is_nullable, data_type FROM information_schema.columns WHERE table_name = '${table}' AND table_schema = 'public'` 
    });
    
    if (error) {
      console.error(`Error fetching schema for ${table}:`, error.message);
      continue;
    }
    
    console.table(data);
  }
  
  console.log("\n--- END DATABASE DIAGNOSTIC ---");
}

run();
