import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseServer } from '../../_lib/supabase';
import crypto from "crypto";

function pickBestWorkerProfile(rows: any[] | null | undefined) {
  if (!Array.isArray(rows) || rows.length === 0) return null;

  return [...rows].sort((left, right) => {
    const leftScore = Number(Boolean(left?.face_descriptor ?? left?.faceDescriptor)) + Number(Boolean(left?.biometric_verified));
    const rightScore = Number(Boolean(right?.face_descriptor ?? right?.faceDescriptor)) + Number(Boolean(right?.biometric_verified));
    if (rightScore !== leftScore) return rightScore - leftScore;

    const leftTime = new Date(left?.last_login || left?.updated_at || left?.created_at || 0).getTime();
    const rightTime = new Date(right?.last_login || right?.updated_at || right?.created_at || 0).getTime();
    return rightTime - leftTime;
  })[0];
}

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
      const { data: profiles } = await supabaseServer
        .from('users')
        .select('*')
        .eq('partnerId', partnerId);

      const profile = pickBestWorkerProfile(profiles);

      const faceDescriptor = profile?.face_descriptor ?? profile?.faceDescriptor ?? null;
      const biometricVerified = Boolean(
        profile?.biometric_verified ??
        (profile?.biometric_status ? profile.biometric_status === 'verified' : undefined) ??
        faceDescriptor
      );

      res.json({
        success: true,
        face_descriptor: faceDescriptor,
        biometric_verified: biometricVerified,
      });
    } else {
      res.status(401).json({ success: false, message: "Invalid password" });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
