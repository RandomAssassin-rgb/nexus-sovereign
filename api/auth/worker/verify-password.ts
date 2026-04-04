import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseServer } from '../../_lib/supabase';
import crypto from "crypto";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { partnerId, password } = req.body;
    if (!partnerId || !password) return res.status(400).json({ error: "Missing fields" });

    // Fetch credentials
    const { data: creds, error } = await supabaseServer
      .from('worker_credentials')
      .select('*')
      .eq('partner_id', partnerId)
      .maybeSingle();

    if (error || !creds) return res.status(401).json({ success: false, message: "User not found" });

    // Verify hash
    const hash = crypto.pbkdf2Sync(password, creds.password_salt, 1000, 64, 'sha512').toString('hex');
    
    if (hash === creds.password_hash) {
      res.json({ success: true });
    } else {
      res.status(401).json({ success: false, message: "Invalid password" });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
