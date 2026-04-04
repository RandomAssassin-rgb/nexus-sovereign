import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing Supabase credentials in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function setup() {
  console.log("Initializing database schema...");

  const queries = [
    `CREATE TABLE IF NOT EXISTS public.users (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      partner_id text UNIQUE NOT NULL,
      platform text,
      auth_method text,
      phone text,
      biometric_status text DEFAULT 'pending',
      face_descriptor text,
      last_login timestamptz DEFAULT now(),
      created_at timestamptz DEFAULT now()
    );`,
    `CREATE TABLE IF NOT EXISTS public.workers (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      name text,
      status text DEFAULT 'active',
      lat float8,
      lon float8,
      rating float8,
      platform text,
      trust_score float8 DEFAULT 0.5,
      weeks_enrolled int DEFAULT 8,
      declared_earnings float8 DEFAULT 650.0,
      zone_h3 text,
      created_at timestamptz DEFAULT now()
    );`,
    `CREATE TABLE IF NOT EXISTS public.disruption_triggers (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      zone_h3 text NOT NULL,
      trigger_type text NOT NULL,
      severity float8,
      fired_at timestamptz DEFAULT now()
    );`,
    `INSERT INTO public.workers (name, status, lat, lon, platform, trust_score, weeks_enrolled, declared_earnings, zone_h3)
     VALUES ('Ravi Kumar', 'active', 12.9716, 77.5946, 'Blinkit', 0.85, 12, 900.0, '8760a0000ffffff')
     ON CONFLICT DO NOTHING;`,
    `INSERT INTO public.disruption_triggers (zone_h3, trigger_type, severity)
     VALUES 
     ('8760a0000ffffff', 'rain', 0.8),
     ('8760a0000ffffff', 'rain', 0.9),
     ('8760a0000ffffff', 'heat', 0.7),
     ('8760a0000ffffff', 'platform', 1.0)
     ON CONFLICT DO NOTHING;`
  ];

  for (const query of queries) {
    try {
      const { error } = await supabase.rpc('exec_sql', { sql_query: query });
      if (error) {
        console.warn("Notice:", error.message);
      } else {
        console.log("Successfully executed query.");
      }
    } catch (e: any) {
      console.warn("RPC Error (Likely missing 'exec_sql'):", e.message);
      console.log("Please run this SQL manually in Supabase SQL Editor:");
      console.log(query);
      console.log("---");
    }
  }

  console.log("Database setup attempt complete.");
}

setup();
