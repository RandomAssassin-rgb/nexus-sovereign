import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseServer } from '../../_lib/supabase';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { data, error } = await supabaseServer
      .from("admin_users")
      .select("id, role, face_descriptor")
      .not("face_descriptor", "is", null);

    if (error) return res.status(500).json({ success: false, message: error.message });
    res.json({ success: true, profiles: data || [] });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message });
  }
}
