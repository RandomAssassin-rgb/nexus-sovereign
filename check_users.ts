import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function check() {
  console.log("Checking Supabase connection and users table...");
  const { data, error } = await supabase.from('users').select('*');
  
  if (error) {
    console.error("Error fetching users:", error.message);
    return;
  }

  console.log(`Found ${data.length} users in the database.`);
  if (data.length > 0) {
    console.log("First user detail:", JSON.stringify(data[0], null, 2));
  } else {
    console.log("CRITICAL: No users found in Supabase. Simulations will not trigger payouts for anyone.");
    console.log("Suggestion: Make sure you have logged in/signed up on the worker app to create a record.");
  }
}

check();
