import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!, 
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function enableRealtime() {
    console.log("Enabling Supabase Realtime replication...");

    const sqlQueries = [
        `ALTER PUBLICATION supabase_realtime ADD TABLE public.users;`,
        `ALTER PUBLICATION supabase_realtime ADD TABLE public.claims;`,
        `ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;`
    ];

    for (const query of sqlQueries) {
        console.log(`Executing: ${query}`);
        const { error } = await supabase.rpc('exec_sql', { sql_query: query });
        if (error) {
            console.error("Migration Error:", error.message);
            console.log("Tip: If error is 'table already exists', it means replication was already enabled.");
        } else {
            console.log("Success.");
        }
    }

    console.log("Realtime configuration complete.");
}

enableRealtime();
