import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testTable(tableName: string) {
  console.log(`\n🔍 Auditing Table: ${tableName}...`);
  const { data, error } = await supabase.from(tableName).select('*').limit(1);
  
  if (error) {
    if (error.code === '42501') {
      console.log(`✅ ${tableName}: RLS is ACTIVE (Permission Denied).`);
    } else {
      console.log(`⚠️ ${tableName}: Unexpected Error:`, error.message);
    }
  } else if (data && data.length > 0) {
    console.log(`🚨 VULNERABILITY: ${tableName} allows UNRESTRICTED anonymous access!`);
  } else {
    console.log(`ℹ️ ${tableName}: No data returned (RLS might be on, or table is empty).`);
  }
}

async function runAudit() {
  console.log("🚀 Starting Supabase Security Audit (Anonymous Context)...");
  const tables = ['users', 'claims', 'transactions', 'premium_plans', 'admin_codes', 'payout_logs'];
  for (const table of tables) {
    await testTable(table);
  }
}

runAudit();
