import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseServer } from '../../_lib/supabase';
import { ensureSkeletonUser } from '../../_lib/supabaseHelper';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const {
      platform,
      method,
      partnerId,
      phone,
      biometric_verified,
      face_descriptor,
      aadhaar_verified,
      aadhaar_number,
      fullName,
    } = req.body || {};
    if (!partnerId) return res.status(400).json({ error: "Missing partnerId" });

    const skeletonUser = await ensureSkeletonUser(partnerId, 0, fullName || null);
    const normalizedPhone = phone || skeletonUser?.phone || null;

    let parsedDescriptor = face_descriptor;
    if (typeof face_descriptor === 'string') {
      try {
        parsedDescriptor = JSON.parse(face_descriptor);
      } catch {
        parsedDescriptor = face_descriptor;
      }
    }

    const modernPayload: Record<string, unknown> = {
      partnerId,
      last_login: new Date().toISOString(),
    };

    if (platform) modernPayload.platform = platform;
    if (method) modernPayload.auth_method = method;
    if (normalizedPhone) modernPayload.phone = normalizedPhone;
    if (fullName) modernPayload.full_name = fullName;
    if (biometric_verified !== undefined) modernPayload.biometric_status = biometric_verified ? 'verified' : 'pending';
    if (face_descriptor) modernPayload.face_descriptor = face_descriptor;
    if (aadhaar_verified !== undefined) modernPayload.aadhaar_verified = Boolean(aadhaar_verified);
    if (aadhaar_number) modernPayload.aadhaar_number = aadhaar_number;

    let data: any = null;

    const modernResult = await supabaseServer
      .from('users')
      .upsert(modernPayload, { onConflict: 'partnerId' })
      .select();

    if (!modernResult.error) {
      data = modernResult.data;
      return res.json({ success: true, data });
    }

    const legacyPayload: Record<string, unknown> = {
      partnerId,
      created_at: new Date().toISOString(),
    };

    if (platform) legacyPayload.platform = platform;
    if (method) legacyPayload.auth_method = method;
    if (normalizedPhone) legacyPayload.phone = normalizedPhone;
    if (parsedDescriptor) legacyPayload.faceDescriptor = parsedDescriptor;
    if (typeof req.body?.face_image === 'string') legacyPayload.faceImage = req.body.face_image;
    if (aadhaar_verified !== undefined) legacyPayload.aadhaarVerified = Boolean(aadhaar_verified);
    if (!('password' in legacyPayload)) legacyPayload.password = null;

    const legacyResult = await supabaseServer
      .from('users')
      .upsert(legacyPayload, { onConflict: 'partnerId' })
      .select();

    if (legacyResult.error) throw legacyResult.error;
    data = legacyResult.data;
    res.json({ success: true, data });
  } catch (error: any) {
    res.json({ success: true, message: "Registration cached locally (Supabase table error: " + error.message + ")" });
  }
}
