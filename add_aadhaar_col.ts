import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function addAadhaar() {
  console.log("Adding 'aadhaar_number' column to 'users' table...");
  const { data, error } = await supabase.rpc('exec_sql', {
    sql_query: "ALTER TABLE public.users ADD COLUMN IF NOT EXISTS aadhaar_number text;"
  });
  
  if (error) {
    if (error.message.includes("function \"exec_sql\" does not exist")) {
        console.error("RPC 'exec_sql' not found. Please run the SQL manually in Supabase SQL Editor: ALTER TABLE public.users ADD COLUMN IF NOT EXISTS aadhaar_number text;");
    } else {
        console.error("Error:", error.message);
    }
  } else {
    console.log("Column 'aadhaar_number' added successfully (or already existed).");
  }
}
addAadhaar();
