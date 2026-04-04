import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseServer } from '../../_lib/supabase';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { aadhaar_number, admin_code } = req.body;
    if (!aadhaar_number || !admin_code) return res.status(400).json({ success: false, message: "Missing fields." });

    const { data, error } = await supabaseServer
      .from("admin_users")
      .select("id, role, face_descriptor")
      .eq("admin_code", admin_code.trim())
      .eq("aadhaar_number", aadhaar_number.replace(/\s/g, ""));

    if (error || !data || data.length === 0) {
      return res.status(401).json({ success: false, message: "No admin found with that Aadhaar number." });
    }

    res.json({ success: true, admin: data[0] });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message });
  }
}
