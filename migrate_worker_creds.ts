import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const CREDENTIALS_FILE = "credentials_db.json";

async function migrate() {
  if (!fs.existsSync(CREDENTIALS_FILE)) {
    console.log("No credentials file found. Skipping migration.");
    return;
  }

  const db = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf-8'));
  const entries = Object.entries(db);

  console.log(`Starting migration of ${entries.length} credentials...`);

  for (const [pid, creds] of entries) {
    const { hash, salt } = creds as any;
    console.log(`Migrating ${pid}...`);
    
    // Ensure the user exists in 'users' table first to satisfy FK
    const { data: user } = await supabase.from('users').select('partnerId').eq('partnerId', pid).maybeSingle();
    
    if (!user) {
        console.warn(`[Migration] ⚠️ User ${pid} not found in 'users' table. Creating placeholder...`);
        const { error: insertUserErr } = await supabase.from('users').insert([{ 
            partnerId: pid, 
            phone: `+91-${Math.floor(Math.random() * 9000000000 + 1000000000)}`,
            balance: 0,
            platform: pid.startsWith('BLK') ? 'Blinkit' : 'Zepto'
        }]);
        if (insertUserErr) {
            console.error(`❌ Failed to create user ${pid}:`, insertUserErr.message);
            continue;
        }
    }

    const { error } = await supabase
      .from('worker_credentials')
      .upsert({
        partner_id: pid,
        password_hash: hash,
        password_salt: salt
      });

    if (error) {
      console.error(`❌ Failed to migrate ${pid}:`, error.message);
    } else {
      console.log(`✅ Migrated ${pid} successfully.`);
    }
  }

  console.log("Migration finished.");
}

migrate();
