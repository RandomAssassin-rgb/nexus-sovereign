import { supabaseServer } from './src/lib/supabaseServer.ts';

async function applyMigrations() {
  console.log("🚀 Applying Vercel Schema Migrations...");

  const ddl = `
    -- Enable Extension
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

    -- WebAuthn Persistence
    CREATE TABLE IF NOT EXISTS webauthn_challenges (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id TEXT NOT NULL,
        challenge TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_webauthn_challenges_user_id ON webauthn_challenges(user_id);

    CREATE TABLE IF NOT EXISTS kv_cache (
        key TEXT PRIMARY KEY,
        value JSONB NOT NULL,
        expires_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    -- Ensure admin_users has all columns
    ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS admin_code TEXT;
    ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS face_descriptor TEXT;
    ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS biometric_verified BOOLEAN DEFAULT false;
    ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS aadhaar_number TEXT;
    ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS aadhaar_verified BOOLEAN DEFAULT false;
    ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS webauthn_devices JSONB DEFAULT '[]'::jsonb;

    -- Ensure users has webauthn_devices
    ALTER TABLE users ADD COLUMN IF NOT EXISTS webauthn_devices JSONB DEFAULT '[]'::jsonb;
  `;

  // Note: DDL execution usually needs a specific Supabase RPC or execute_sql.
  // Since we don't have a direct 'sql' method in the JS client without an RPC, 
  // I will just prepare this and inform the user to run it in the SQL Editor, 
  // OR try to see if they have a 'exec_sql' RPC.
  
  console.log("📋 DDL TO APPLY IN SUPABASE SQL EDITOR:");
  console.log(ddl);

  // We can try to see if an RPC exists
  const { data: rpcs, error: rpcErr } = await supabaseServer.rpc('exec_sql', { sql: ddl });
  if (rpcErr) {
    console.warn("⚠️  Could not run DDL automatically (RPC 'exec_sql' not found). Please run the SQL above manually.");
  } else {
    console.log("✅ DDL Applied successfully via RPC.");
  }
}

applyMigrations();
