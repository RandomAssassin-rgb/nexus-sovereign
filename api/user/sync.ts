import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseServer } from '../_lib/supabase';

function normalizeUser(user: any) {
  if (!user) return null;

  const balance = Number(user.balance);
  const rawDescriptor = user.face_descriptor ?? user.faceDescriptor ?? null;

  return {
    ...user,
    ...(Number.isFinite(balance) ? { balance } : {}),
    face_descriptor: Array.isArray(rawDescriptor) ? JSON.stringify(rawDescriptor) : rawDescriptor,
    face_image: user.face_image ?? user.faceImage ?? user.avatar_url ?? null,
    aadhaar_number: user.aadhaar_number ?? user.aadhaarNumber ?? null,
    aadhaar_verified: user.aadhaar_verified ?? user.aadhaarVerified ?? false,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const queryPartnerId = Array.isArray(req.query?.partnerId) ? req.query.partnerId[0] : req.query?.partnerId;
    const bodyPartnerId = typeof req.body === 'object' && req.body !== null ? req.body.partnerId : undefined;
    const partnerId = queryPartnerId || bodyPartnerId;
    if (!partnerId) return res.status(400).json({ error: "Missing partnerId" });

    // Parallel fetch for speed
    const [userRes, transRes, claimsRes] = await Promise.all([
      supabaseServer.from('users').select('*').eq('partnerId', partnerId).maybeSingle(),
      supabaseServer.from('transactions').select('*').eq('worker_id', partnerId).order('created_at', { ascending: false }).limit(20),
      supabaseServer.from('claims').select('*').eq('worker_id', partnerId).order('processed_at', { ascending: false }).limit(10)
    ]);

    if (userRes.error) throw userRes.error;
    if (transRes.error) throw transRes.error;
    if (claimsRes.error) throw claimsRes.error;

    res.json({
      success: true,
      user: normalizeUser(userRes.data),
      transactions: transRes.data || [],
      claims: claimsRes.data || [],
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
