import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const sql = `
-- Create admin_codes table for tracking valid signup codes
CREATE TABLE IF NOT EXISTS admin_codes (
    code VARCHAR(50) PRIMARY KEY,
    role VARCHAR(50) NOT NULL, -- e.g., 'Insurer Admin', 'Claims Adjuster'
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Seed an admin code
INSERT INTO admin_codes (code, role, is_active)
VALUES ('NEXUS-ADMIN-2026', 'Insurer Admin', true)
ON CONFLICT (code) DO NOTHING;

-- Create admin_users table
CREATE TABLE IF NOT EXISTS admin_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_code VARCHAR(50) REFERENCES admin_codes(code),
    role VARCHAR(50) NOT NULL,
    aadhaar_verified BOOLEAN DEFAULT false,
    aadhaar_number VARCHAR(20),
    biometric_verified BOOLEAN DEFAULT false,
    face_descriptor TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);
`;

async function runMigration() {
    const { error } = await supabase.rpc('exec_sql', { sql_query: sql });
    if (error) {
        console.error("Migration Error:", error.message);
    } else {
        console.log("Admin tables created and seeded successfully.");
    }
}

runMigration();
