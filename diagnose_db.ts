import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function diagnose() {
  console.log("========== NEXUS SOVEREIGN DATABASE DIAGNOSTIC ==========\n");

  // 1. Check what tables exist
  console.log("--- 1. TABLES ---");
  const { data: tables, error: tablesErr } = await supabase
    .from('information_schema.tables' as any)
    .select('table_name')
    .eq('table_schema', 'public');
  
  // Alternative: use raw query approach via rpc
  // Since information_schema may not work, let's try direct selects
  
  const tablesToCheck = ['users', 'claims', 'transactions', 'wallet_transactions', 'workers', 'admin_users', 'admin_codes', 'disruption_triggers'];
  
  for (const table of tablesToCheck) {
    const { data, error } = await supabase.from(table).select('*').limit(1);
    if (error) {
      console.log(`  ❌ ${table}: ${error.message}`);
    } else {
      console.log(`  ✅ ${table}: EXISTS (${data.length} sample rows)`);
      if (data.length > 0) {
        console.log(`     Columns: ${Object.keys(data[0]).join(', ')}`);
        console.log(`     Sample: ${JSON.stringify(data[0]).substring(0, 200)}`);
      }
    }
  }

  // 2. Check users table specifically
  console.log("\n--- 2. ALL USERS ---");
  const { data: allUsers, error: usersErr } = await supabase.from('users').select('*');
  if (usersErr) {
    console.log(`  ❌ Error: ${usersErr.message}`);
  } else {
    console.log(`  Total users: ${allUsers?.length || 0}`);
    if (allUsers && allUsers.length > 0) {
      console.log(`  Columns: ${Object.keys(allUsers[0]).join(', ')}`);
      allUsers.forEach((u, i) => {
        // Check for partnerId vs partner_id
        const pid = (u as any).partnerId || (u as any).partner_id;
        console.log(`  User ${i}: id=${u.id}, partnerId=${(u as any).partnerId}, partner_id=${(u as any).partner_id}, balance=${(u as any).balance}`);
      });
    }
  }

  // 3. Check claims table
  console.log("\n--- 3. ALL CLAIMS ---");
  const { data: allClaims, error: claimsErr } = await supabase.from('claims').select('*').limit(5);
  if (claimsErr) {
    console.log(`  ❌ Error: ${claimsErr.message}`);
  } else {
    console.log(`  Total claims (sample): ${allClaims?.length || 0}`);
    if (allClaims && allClaims.length > 0) {
      console.log(`  Columns: ${Object.keys(allClaims[0]).join(', ')}`);
      allClaims.forEach((c, i) => {
        console.log(`  Claim ${i}: ${JSON.stringify(c).substring(0, 200)}`);
      });
    }
  }

  // 4. Check transactions table
  console.log("\n--- 4. TRANSACTIONS ---");
  const { data: allTxns, error: txnsErr } = await supabase.from('transactions').select('*').limit(5);
  if (txnsErr) {
    console.log(`  ❌ Error: ${txnsErr.message}`);
  } else {
    console.log(`  Total transactions (sample): ${allTxns?.length || 0}`);
    if (allTxns && allTxns.length > 0) {
      console.log(`  Columns: ${Object.keys(allTxns[0]).join(', ')}`);
      allTxns.forEach((t, i) => {
        console.log(`  Transaction ${i}: ${JSON.stringify(t).substring(0, 200)}`);
      });
    }
  }

  // 5. Check wallet_transactions (old name)
  console.log("\n--- 5. WALLET_TRANSACTIONS (LEGACY) ---");
  const { data: wt, error: wtErr } = await supabase.from('wallet_transactions').select('*').limit(1);
  if (wtErr) {
    console.log(`  ❌ ${wtErr.message} (this is expected if renamed)`);
  } else {
    console.log(`  ✅ wallet_transactions table EXISTS with ${wt?.length} rows`);
  }

  // 6. Check Realtime publication
  console.log("\n--- 6. REALTIME PUBLICATION CHECK ---");
  // We can't query pg_publication_tables directly, but we can test if subscribe works

  // 7. Quick simulation test: try inserting a claim
  console.log("\n--- 7. SIMULATION INSERT TEST ---");
  const testUsers = allUsers || [];
  if (testUsers.length === 0) {
    console.log("  ❌ No users found - cannot test simulation");
  } else {
    const testUser = testUsers[0];
    const testPid = (testUser as any).partnerId || (testUser as any).partner_id;
    console.log(`  Testing with user: ${testPid}`);
    
    // Try inserting a claim the way the simulate endpoint does it
    const { data: testClaim, error: testClaimErr } = await supabase.from('claims').insert({
      worker_id: testPid,
      payout_inr: 100,
      status: "approved",
      processed_at: new Date().toISOString(),
      jep_data: { test: true }
    }).select().single();
    
    if (testClaimErr) {
      console.log(`  ❌ Claim insert failed: ${testClaimErr.message}`);
      console.log(`     Details: ${JSON.stringify(testClaimErr)}`);
      
      // Try alternative column names
      console.log("  Trying alternative column names...");
      const { data: testClaim2, error: testClaimErr2 } = await supabase.from('claims').insert({
        user_id: testUser.id,
        amount: 100,
        status: "approved",
        created_at: new Date().toISOString(),
        jep_data: { test: true },
        type: "test",
        reason: "diagnostic test"
      }).select().single();
      
      if (testClaimErr2) {
        console.log(`  ❌ Alt claim insert also failed: ${testClaimErr2.message}`);
      } else {
        console.log(`  ✅ Alt claim insert succeeded! Schema uses user_id + amount, NOT worker_id + payout_inr`);
        // Clean up
        await supabase.from('claims').delete().eq('id', testClaim2.id);
      }
    } else {
      console.log(`  ✅ Claim insert succeeded: ${testClaim?.id}`);
      // Clean up
      await supabase.from('claims').delete().eq('id', testClaim.id);
    }
  }

  console.log("\n========== DIAGNOSTIC COMPLETE ==========");
}

diagnose().catch(console.error);
