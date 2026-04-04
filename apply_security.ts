import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function applySecurity() {
  console.log("🔒 Applying Production Security Hardening...");
  
  const sqlPath = path.join(process.cwd(), 'secure_lockdown.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  // Supabase JS client doesn't have a direct 'run_sql' method for safety.
  // We use the 'rpc' method to call a common helper, or if that's missing, we provide instructions.
  
  const { data, error } = await supabase.rpc('execute_sql', { query: sql });
  
  if (error) {
    console.error("❌ SQL Migration Failed:", error.message);
    if (error.message.includes("function \"execute_sql\" does not exist")) {
      console.log("\n⚠️  CRITICAL: The 'execute_sql' helper function is missing from your Supabase SQL Editor.");
      console.log("Please copy the contents of 'secure_lockdown.sql' and paste it DIRECTLY into the Supabase SQL Editor at:");
      console.log(`${SUPABASE_URL.replace('.supabase.co', '')}.supabase.co/project/default/sql`);
    }
  } else {
    console.log("✅ Security Hardening Applied Successfully.");
  }
}

applySecurity();
