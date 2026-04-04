import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function addAadhaar() {
  console.log("Adding 'aadhaar_number' column to 'users' table using execute_sql...");
  const { data, error } = await supabase.rpc('execute_sql', {
    query: "ALTER TABLE public.users ADD COLUMN IF NOT EXISTS aadhaar_number text;"
  });
  
  if (error) {
    console.error("Error:", error.message);
  } else {
    console.log("Column 'aadhaar_number' added successfully (or already existed).");
  }
}
addAadhaar();
