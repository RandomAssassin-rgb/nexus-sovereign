import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function run() {
    const { data: columns, error } = await supabase.rpc('exec_sql', {
        sql_query: "SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND table_schema = 'public';"
    });

    if (error) {
        console.error("RPC Error:", error.message);
        // Fallback for missing RPC
        const { data } = await supabase.from('users').select('*').limit(1);
        if (data && data.length > 0) {
            console.log("REAL_COLUMNS_SAMPLED:", Object.keys(data[0]));
        } else {
            console.log("Table empty or not found. Cannot sample.");
        }
    } else {
        console.log("REAL_DB_COLUMNS_FULL:", columns);
    }
}

run();
