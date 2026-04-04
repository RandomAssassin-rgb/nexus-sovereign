import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function listRPCs() {
  console.log("Listing available RPCs...");
  const { data, error } = await supabase.from('information_schema.routines' as any)
    .select('routine_name')
    .eq('routine_schema', 'public');
  
  if (error) {
    console.error("Error:", error.message);
    // If table access is blocked, try a common one
    console.log("Testing common RPC names...");
    const commonNames = ['exec_sql', 'execute_sql', 'run_sql', 'sql'];
    for (const name of commonNames) {
        const { error: rpcErr } = await supabase.rpc(name, { query: 'SELECT 1', sql_query: 'SELECT 1' });
        if (rpcErr && !rpcErr.message.includes('not found')) {
            console.log(`RPC '${name}' MIGHT exist (error: ${rpcErr.message})`);
        } else if (!rpcErr) {
            console.log(`RPC '${name}' EXISTS!`);
        }
    }
  } else {
    console.log("Available RPCs:", data.map((r: any) => r.routine_name));
  }
}
listRPCs();
