import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function inspectUser() {
  console.log("Inspecting first row of 'users' table...");
  const { data, error } = await supabase.from('users').select('*').limit(1);
  if (error) {
    console.error("Error:", error.message);
  } else if (data && data.length > 0) {
    console.log("Keys in 'users' row:", Object.keys(data[0]));
    console.log("Sample Data:", data[0]);
  } else {
    console.log("No users found.");
  }
}
inspectUser();
