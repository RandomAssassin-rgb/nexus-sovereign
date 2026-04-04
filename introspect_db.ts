import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function checkEntireSchema() {
  console.log("--- Checking for all tables in 'public' schema ---");
  const { data: tables, error: tablesError } = await supabase.rpc('exec_sql', { sql_query: "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'" });
  
  if (tablesError) {
    console.error("Error listing tables:", tablesError.message);
    // Fallback if exec_sql rpc is not there
    console.log("Trying to query 'users' directly...");
    const { data: userData, error: userError } = await supabase.from('users').select('*').limit(1);
    if (userError) {
        console.error("Error querying users table:", userError.message);
    } else {
        console.log("Users table exists. Columns:", Object.keys(userData[0] || {}));
    }
  } else {
    console.log("Tables found:", tables);
    for (const table of tables) {
        const tableName = table.table_name;
        const { data: cols, error: colsError } = await supabase.rpc('exec_sql', { sql_query: `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '${tableName}'` });
        if (!colsError) {
            console.log(`\nTable: ${tableName}`);
            console.table(cols);
        }
    }
  }
}

checkEntireSchema();
