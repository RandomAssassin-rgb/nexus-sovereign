import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function checkSchema() {
  const { data, error } = await supabase.from('users').select('*').limit(1);
  if (error) {
    console.error("Schema Verification Failed:", error.message);
  } else {
    console.log("Users Columns:", Object.keys(data[0] || {}));
  }
}
checkSchema();
