import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function run() {
    const tables = ['users', 'claims', 'transactions'];
    for (const table of tables) {
        console.log(`--- Schema for table: ${table} ---`);
        const { data, error } = await supabase.rpc('exec_sql', {
            sql_query: `SELECT column_name FROM information_schema.columns WHERE table_name = '${table}' AND table_schema = 'public';`
        });
        if (error) {
            console.error(`Error fetching columns for ${table}:`, error.message);
        } else {
            console.log(`Columns for ${table}:`, data.map((c: any) => c.column_name).join(', '));
        }
    }
}

run();
