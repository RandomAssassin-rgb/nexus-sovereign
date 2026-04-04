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
      .eq('partnerId', partnerId)
      .maybeSingle();

    if (error) {
      return res.status(200).json({ success: true, user: null, warning: error.message });
    }

    return res.json({ success: true, user: normalizeUser(data) });
  } catch (error: any) {
    return res.status(200).json({ success: true, user: null, warning: error.message });
  }
}
