import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function checkColumns() {
    console.log("Checking columns for 'users' table...");
    const { data, error } = await supabase.rpc('exec_sql', {
        sql_query: "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'users';"
    });
    
    if (error) {
        console.error("Error:", error.message);
    } else {
        console.log("Columns in 'users':", data);
    }
}

checkColumns();
