import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseServer } from '../../_lib/supabase';
import { ensureSkeletonUser } from '../../_lib/supabaseHelper.ts';
import crypto from "crypto";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { partnerId, password, fullName } = req.body;
    if (!partnerId || !password) return res.status(400).json({ error: "Missing fields" });

    // 1. Ensure user exists
    await ensureSkeletonUser(partnerId, 0.0, fullName);

    // 2. Hash password
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');

    // 3. Store credentials
    const { error } = await supabaseServer
      .from('worker_credentials')
      .upsert({
        partner_id: partnerId,
        password_hash: hash,
        password_salt: salt
      });

    if (error) throw error;
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
