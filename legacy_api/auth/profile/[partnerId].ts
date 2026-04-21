import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseServer } from '../../_lib/supabase';

function normalizeUser(user: any) {
  if (!user) return null;

  const rawDescriptor = user.face_descriptor ?? user.faceDescriptor ?? null;
  const faceDescriptor = Array.isArray(rawDescriptor) ? JSON.stringify(rawDescriptor) : rawDescriptor;

  return {
    ...user,
    face_descriptor: faceDescriptor,
    face_image: user.face_image ?? user.faceImage ?? user.avatar_url ?? null,
    aadhaar_number: user.aadhaar_number ?? user.aadhaarNumber ?? null,
    aadhaar_verified: user.aadhaar_verified ?? user.aadhaarVerified ?? false,
    biometric_verified: Boolean(
      user.biometric_verified ??
      (user.biometric_status ? user.biometric_status === 'verified' : undefined) ??
      rawDescriptor
    ),
  };
}

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
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  const rawPartnerId = req.query.partnerId;
  const partnerId = Array.isArray(rawPartnerId) ? rawPartnerId[0] : rawPartnerId;
  if (!partnerId) return res.status(400).json({ success: false, error: 'Missing partnerId' });

  try {
    const { data, error } = await supabaseServer
      .from('users')
      .select('*')
      .eq('partnerId', partnerId);

    if (error) {
      return res.status(200).json({ success: true, user: null, warning: error.message });
    }

    return res.json({ success: true, user: normalizeUser(pickBestWorkerProfile(data)) });
  } catch (error: any) {
    return res.status(200).json({ success: true, user: null, warning: error.message });
  }
}
