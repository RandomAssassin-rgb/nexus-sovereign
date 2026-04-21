import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseServer } from '../../_lib/supabase';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { admin_id, aadhaar_number } = req.body;
    if (!admin_id || !aadhaar_number) return res.status(400).json({ success: false, message: "Missing fields." });

    const { error } = await supabaseServer
      .from("admin_users")
      .update({ aadhaar_number, aadhaar_verified: true })
      .eq("id", admin_id);

    if (error) return res.status(500).json({ success: false, message: error.message });
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message });
  }
}
