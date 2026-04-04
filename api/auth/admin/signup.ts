import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseServer } from '../../_lib/supabase';
import * as bcrypt from 'bcryptjs';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { admin_code, password } = req.body;
    if (!admin_code || !password) {
      return res.status(400).json({ success: false, message: "Admin code and password are required." });
    }

    // Validate code format: NEXUS-ADMIN-XXXX (any 4 digits)
    const codePattern = /^NEXUS-ADMIN-\d{4}$/;
    if (!codePattern.test(admin_code.trim())) {
      return res.status(400).json({ success: false, message: "invalid" });
    }

    // Ensure this code exists in admin_codes
    const { error: codeUpsertErr } = await supabaseServer
      .from("admin_codes")
      .upsert([{ code: admin_code.trim(), role: "Insurer Admin", is_active: true }], { onConflict: "code" });
    
    if (codeUpsertErr) {
      console.warn("admin_codes upsert warning:", codeUpsertErr.message);
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, 12);

    // Create pending admin user
    const { data: user, error: userErr } = await supabaseServer
      .from("admin_users")
      .insert([{ admin_code: admin_code.trim(), role: "Insurer Admin", password_hash }])
      .select("id, role, admin_code")
      .single();

    if (userErr) return res.status(500).json({ success: false, message: userErr.message });

    res.json({ success: true, admin: user });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message });
  }
}
