import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function fixSchema() {
  console.log("========== NEXUS SOVEREIGN: COMPREHENSIVE SCHEMA FIX ==========\n");

  // ─── 1. ADD MISSING COLUMNS TO USERS TABLE ────────────────────────────────
  console.log("--- STEP 1: Fix users table ---");
  const userColumns = [
    { col: 'balance', sql: `ALTER TABLE public.users ADD COLUMN IF NOT EXISTS balance numeric DEFAULT 3450.0;` },
    { col: 'last_lat', sql: `ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_lat numeric;` },
    { col: 'last_lng', sql: `ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_lng numeric;` },
    { col: 'last_seen', sql: `ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_seen timestamptz DEFAULT now();` },
    { col: 'last_login', sql: `ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_login timestamptz DEFAULT now();` },
    { col: 'auth_method', sql: `ALTER TABLE public.users ADD COLUMN IF NOT EXISTS auth_method text;` },
    { col: 'biometric_status', sql: `ALTER TABLE public.users ADD COLUMN IF NOT EXISTS biometric_status text DEFAULT 'pending';` },
    { col: 'payment_methods', sql: `ALTER TABLE public.users ADD COLUMN IF NOT EXISTS payment_methods jsonb;` },
    { col: 'premium_upgraded', sql: `ALTER TABLE public.users ADD COLUMN IF NOT EXISTS premium_upgraded boolean DEFAULT false;` },
    { col: 'premium_tier', sql: `ALTER TABLE public.users ADD COLUMN IF NOT EXISTS premium_tier text;` },
  ];

  for (const { col, sql } of userColumns) {
    const { error } = await supabase.rpc('exec_sql', { sql_query: sql });
    if (error) {
      // Try alternative: direct REST approach won't work for DDL, so log it
      console.log(`  ⚠️  ${col}: ${error.message}`);
    } else {
      console.log(`  ✅ ${col}: Added`);
    }
  }

  // ─── 2. ADD MISSING COLUMNS TO CLAIMS TABLE ────────────────────────────────
  console.log("\n--- STEP 2: Fix claims table ---");
  const claimColumns = [
    { col: 'type', sql: `ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS type text;` },
    { col: 'reason', sql: `ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS reason text;` },
    { col: 'lat', sql: `ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS lat numeric;` },
    { col: 'lng', sql: `ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS lng numeric;` },
    { col: 'h3_cell', sql: `ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS h3_cell text;` },
    { col: 'claim_id_str', sql: `ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS claim_id_str text;` },
  ];

  for (const { col, sql } of claimColumns) {
    const { error } = await supabase.rpc('exec_sql', { sql_query: sql });
    if (error) {
      console.log(`  ⚠️  ${col}: ${error.message}`);
    } else {
      console.log(`  ✅ ${col}: Added`);
    }
  }

  // ─── 3. ADD MISSING COLUMNS TO TRANSACTIONS TABLE ──────────────────────────
  console.log("\n--- STEP 3: Fix transactions table ---");
  const txnColumns = [
    { col: 'title', sql: `ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS title text;` },
    { col: 'via', sql: `ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS via text;` },
  ];

  for (const { col, sql } of txnColumns) {
    const { error } = await supabase.rpc('exec_sql', { sql_query: sql });
    if (error) {
      console.log(`  ⚠️  ${col}: ${error.message}`);
    } else {
      console.log(`  ✅ ${col}: Added`);
    }
  }

  // ─── 4. SET DEFAULT BALANCE FOR EXISTING USERS ─────────────────────────────
  console.log("\n--- STEP 4: Set default balance for existing users ---");
  const { error: balErr } = await supabase.rpc('exec_sql', { 
    sql_query: `UPDATE public.users SET balance = 3450.0 WHERE balance IS NULL;` 
  });
  if (balErr) {
    console.log(`  ⚠️  Balance fix: ${balErr.message}`);
  } else {
    console.log(`  ✅ Default balance set for existing users`);
  }

  // ─── 5. ENABLE REALTIME ON ALL TABLES ──────────────────────────────────────
  console.log("\n--- STEP 5: Enable Realtime ---");
  const realtimeTables = ['users', 'claims', 'transactions'];
  for (const table of realtimeTables) {
    const { error } = await supabase.rpc('exec_sql', { 
      sql_query: `ALTER PUBLICATION supabase_realtime ADD TABLE public.${table};` 
    });
    if (error) {
      if (error.message.includes('already member') || error.message.includes('already exists')) {
        console.log(`  ✅ ${table}: Already enabled`);
      } else {
        console.log(`  ⚠️  ${table}: ${error.message}`);
      }
    } else {
      console.log(`  ✅ ${table}: Realtime enabled`);
    }
  }

  // ─── 6. ENABLE REPLICA IDENTITY FULL (needed for Realtime filters) ─────────
  console.log("\n--- STEP 6: Set REPLICA IDENTITY FULL (for Realtime filters) ---");
  for (const table of realtimeTables) {
    const { error } = await supabase.rpc('exec_sql', { 
      sql_query: `ALTER TABLE public.${table} REPLICA IDENTITY FULL;` 
    });
    if (error) {
      console.log(`  ⚠️  ${table}: ${error.message}`);
    } else {
      console.log(`  ✅ ${table}: REPLICA IDENTITY FULL set`);
    }
  }

  // ─── 7. VERIFY ─────────────────────────────────────────────────────────────
  console.log("\n--- STEP 7: Verification ---");
  const { data: verifyUser, error: vErr } = await supabase.from('users').select('*').limit(1);
  if (vErr) {
    console.log(`  ❌ Users verification failed: ${vErr.message}`);
  } else if (verifyUser && verifyUser.length > 0) {
    console.log(`  Users columns: ${Object.keys(verifyUser[0]).join(', ')}`);
    console.log(`  Balance: ${(verifyUser[0] as any).balance}`);
  }

  const { data: verifyClaims, error: vcErr } = await supabase.from('claims').select('*').limit(1);
  if (vcErr) {
    console.log(`  ❌ Claims verification failed: ${vcErr.message}`);
  } else if (verifyClaims && verifyClaims.length > 0) {
    console.log(`  Claims columns: ${Object.keys(verifyClaims[0]).join(', ')}`);
  }

  const { data: verifyTxns, error: vtErr } = await supabase.from('transactions').select('*').limit(1);
  if (vtErr) {
    console.log(`  ❌ Transactions verification failed: ${vtErr.message}`);
  } else if (verifyTxns && verifyTxns.length > 0) {
    console.log(`  Transactions columns: ${Object.keys(verifyTxns[0]).join(', ')}`);
  }

  console.log("\n========== SCHEMA FIX COMPLETE ==========");
}

fixSchema().catch(console.error);
