import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function verifyAadhaar() {
  console.log("Checking for 'aadhaar_number' column in 'users' table...");
  const { data, error } = await supabase.from('users').select('aadhaar_number').limit(1);
  if (error) {
    if (error.message.includes('column "aadhaar_number" does not exist')) {
      console.log("Column 'aadhaar_number' IS MISSING.");
    } else {
      console.error("Error:", error.message);
    }
  } else {
    console.log("Column 'aadhaar_number' EXISTS.");
  }
}
verifyAadhaar();
