require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  console.log("=== SUPABASE DIAGNOSTIC ===\n");

  // 1. Check users table
  const { data: users, error: ue } = await sb.from('users').select('id, partner_id, balance').limit(5);
  if (ue) {
    console.log("USERS TABLE ERROR:", ue.message, ue.code);
  } else {
    console.log("USERS:", users?.length, "found");
    users?.forEach(u => console.log(`  - id=${u.id}, partner_id=${u.partner_id}, balance=${u.balance}`));
  }

  // 2. Check claims table
  const { data: claims, error: ce } = await sb.from('claims').select('claim_id_str, amount, status, type, user_id').order('created_at', { ascending: false }).limit(5);
  if (ce) {
    console.log("\nCLAIMS TABLE ERROR:", ce.message, ce.code);
  } else {
    console.log("\nCLAIMS:", claims?.length, "found");
    claims?.forEach(c => console.log(`  - ${c.claim_id_str} | ₹${c.amount} | ${c.status} | ${c.type} | user=${c.user_id}`));
  }

  // 3. Check wallet_transactions table
  const { data: txns, error: te } = await sb.from('wallet_transactions').select('title, amount, type, user_id').order('created_at', { ascending: false }).limit(5);
  if (te) {
    console.log("\nTXNS TABLE ERROR:", te.message, te.code);
  } else {
    console.log("\nTXNS:", txns?.length, "found");
    txns?.forEach(t => console.log(`  - ${t.title} | ₹${t.amount} | ${t.type} | user=${t.user_id}`));
  }

  // 4. Check what tables exist
  const { data: tables, error: tabErr } = await sb.rpc('exec_sql', {
    query: "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
  });
  if (tabErr) {
    console.log("\nTABLE LIST (via RPC) ERROR:", tabErr.message);
    // Try alternate approach
    const { data: t2, error: t2e } = await sb.from('information_schema.tables').select('table_name');
    if (t2e) {
      console.log("TABLE LIST (via query) ERROR:", t2e.message);
    }
  } else {
    console.log("\nTABLES:", JSON.stringify(tables));
  }
}

check().catch(e => console.error("FATAL:", e.message));
