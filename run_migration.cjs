const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config();

// Disable TLS verification for self-signed certificates in local development
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing Supabase credentials in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function runMigration() {
  const sql = `
  CREATE TABLE IF NOT EXISTS admin_codes (
      code VARCHAR(50) PRIMARY KEY,
      role VARCHAR(50) NOT NULL,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
  );

  INSERT INTO admin_codes (code, role, is_active)
  VALUES ('NEXUS-ADMIN-2026', 'Insurer Admin', true)
  ON CONFLICT (code) DO NOTHING;

  CREATE TABLE IF NOT EXISTS admin_users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      admin_code VARCHAR(50) REFERENCES admin_codes(code),
      role VARCHAR(50) NOT NULL,
      aadhaar_verified BOOLEAN DEFAULT false,
      aadhaar_number VARCHAR(20),
      biometric_verified BOOLEAN DEFAULT false,
      face_descriptor TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
  );
  `;
  
  console.log("Executing Admin Migration...");
  // Assuming the exec_sql RPC function exists as previously discovered
  const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });
  
  if (error) {
    console.error("Migration failed:", error);
  } else {
    console.log("Migration successful!");
  }
}

runMigration();
