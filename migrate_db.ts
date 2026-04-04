import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function migrate() {
    console.log("Starting database migration...");

    const sqlQueries = [
        // 1. Add columns to users table
        `ALTER TABLE public.users ADD COLUMN IF NOT EXISTS partner_id text UNIQUE;`,
        `ALTER TABLE public.users ADD COLUMN IF NOT EXISTS balance numeric DEFAULT 3450.0;`,
        `ALTER TABLE public.users ADD COLUMN IF NOT EXISTS premium_until timestamptz;`,
        `ALTER TABLE public.users ADD COLUMN IF NOT EXISTS premium_upgraded boolean DEFAULT false;`,
        `ALTER TABLE public.users ADD COLUMN IF NOT EXISTS premium_tier text;`,
        `ALTER TABLE public.users ADD COLUMN IF NOT EXISTS face_descriptor text;`,
        `ALTER TABLE public.users ADD COLUMN IF NOT EXISTS face_image text;`,
        `ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_lat numeric;`,
        `ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_lng numeric;`,
        `ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_seen timestamptz DEFAULT now();`,

        // 2. Create wallet_transactions table
        `CREATE TABLE IF NOT EXISTS public.wallet_transactions (
            id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
            user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
            title text NOT NULL,
            description text,
            amount numeric NOT NULL,
            type text NOT NULL,
            via text,
            created_at timestamptz DEFAULT now()
        );`,

        // 3. Create claims table
        `CREATE TABLE IF NOT EXISTS public.claims (
            id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
            user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
            claim_id_str text, -- Replaces CLM-XXXX for human readable ID
            amount numeric NOT NULL,
            status text NOT NULL,
            type text NOT NULL,
            reason text,
            jep_data jsonb,
            lat numeric,
            lng numeric,
            h3_cell text,
            created_at timestamptz DEFAULT now()
        );`,
        
        // 4. Create an index on partner_id for faster lookups
        `CREATE INDEX IF NOT EXISTS idx_users_partner_id ON public.users(partner_id);`,
        `CREATE INDEX IF NOT EXISTS idx_claims_h3_cell ON public.claims(h3_cell);`
    ];

    for (const query of sqlQueries) {
        console.log(`Executing: ${query.substring(0, 50)}...`);
        const { error } = await supabase.rpc('exec_sql', { sql_query: query });
        if (error) {
            console.error("Migration Error:", error.message);
        } else {
            console.log("Success.");
        }
    }

    console.log("Migration complete.");
}

migrate();
