import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const sql = `
CREATE TABLE IF NOT EXISTS public.alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
    description TEXT,
    worker_id TEXT,
    worker_name TEXT,
    location TEXT,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'dismissed', 'blocked')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Note: Realtime might already be enabled globally, but we specify it for this table.
-- If this fails (e.g. publication doesn't exist), it's non-fatal.
DO $$ 
BEGIN 
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE alerts;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not add table to publication: %', SQLERRM;
END $$;
`;

async function run() {
    console.log("Applying migration for 'alerts' table...");
    // Try 'exec_sql' first
    let { error } = await supabase.rpc('exec_sql', { sql_query: sql });
    
    if (error) {
        console.warn("exec_sql failed, trying 'sql'...", error.message);
        ({ error } = await supabase.rpc('sql', { query: sql }));
    }

    if (error) {
        console.error("Migration failed:", error.message);
        // Fallback: Check if table already exists by querying it
        const { error: checkError } = await supabase.from('alerts').select('id').limit(1);
        if (!checkError || checkError.code === 'PGRST116') {
             console.log("Table 'alerts' seems to exist already.");
        } else {
             console.error("Critical error: Unable to verify or create 'alerts' table.");
             process.exit(1);
        }
    } else {
        console.log("Migration applied successfully!");
    }
}

run();
