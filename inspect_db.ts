import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function run() {
    const { data, error } = await supabase.from('claims').select('*').limit(1);
    if (error) {
        console.error("Error fetching claims:", error.message);
    } else {
        console.log("Claims columns:", Object.keys(data[0] || {}));
    }

    const { data: users, error: userError } = await supabase.from('users').select('*').limit(1);
    if (userError) {
        console.error("Error fetching users:", userError.message);
    } else {
        console.log("Users columns:", Object.keys(users[0] || {}));
    }
}

run();
