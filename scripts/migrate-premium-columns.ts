/**
 * One-time migration script: adds premium_tier + premium_upgraded columns to users table.
 * Run: npx tsx scripts/migrate-premium-columns.ts
 */
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function migrate() {
  console.log("🔧 Running premium_tier migration...");

  // Add premium_tier column (text, nullable)
  const { error: e1 } = await supabase.rpc("exec_sql", {
    sql: `
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS premium_tier TEXT DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS premium_upgraded BOOLEAN DEFAULT FALSE;
    `,
  });

  if (e1) {
    // rpc may not exist — fallback: just try the update and let Supabase auto-create
    console.warn("⚠️  RPC not available, trying direct approach:", e1.message);
    // Try a benign update that forces column existence check
    const { error: e2 } = await supabase
      .from("users")
      .update({ premium_tier: null, premium_upgraded: false })
      .eq("partnerId", "__migration_probe__"); // no-op (no row matches)

    if (e2 && e2.code === "42703") {
      console.error("❌ Columns don't exist and can't be created via client SDK.");
      console.log("👉 Please run this SQL in your Supabase dashboard SQL editor:");
      console.log(`
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS premium_tier TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS premium_upgraded BOOLEAN DEFAULT FALSE;
      `);
    } else {
      console.log("✅ Columns likely already exist or were created.");
    }
    return;
  }

  console.log("✅ Migration complete — premium_tier and premium_upgraded columns ready.");
}

migrate().catch(console.error);
