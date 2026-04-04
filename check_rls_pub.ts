import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function checkRLS() {
  const { data, error } = await supabase.rpc('execute_sql', { 
    query: "SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';" 
  });
  if (error) {
    console.error("Error checking RLS:", error);
  } else {
    console.log("RLS Status:", JSON.stringify(data, null, 2));
  }
}

async function checkPublications() {
  const { data, error } = await supabase.rpc('execute_sql', { 
    query: "SELECT * FROM pg_publication_tables;" 
  });
  if (error) {
    console.error("Error checking publications:", error);
  } else {
    console.log("Publications:", JSON.stringify(data, null, 2));
  }
}

async function run() {
  await checkRLS();
  await checkPublications();
}

run();
