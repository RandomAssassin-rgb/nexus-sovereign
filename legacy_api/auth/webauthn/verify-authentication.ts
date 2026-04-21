import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { supabaseServer } from '../../_lib/supabase';
import jwt from "jsonwebtoken";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { userId, body } = req.body;
    if (!userId || !body) return res.status(400).json({ error: "Missing data" });

    // Fetch challenge
    const { data: challengeData } = await supabaseServer
      .from('webauthn_challenges')
      .select('challenge')
      .eq('user_id', userId)
      .maybeSingle();

    if (!challengeData) return res.status(400).json({ error: "No challenge found" });

    // Fetch user device
    let { data: worker } = await supabaseServer
      .from('users')
      .select('webauthn_devices')
      .eq('partnerId', userId)
      .maybeSingle();

    let devices = worker?.webauthn_devices;
    
    if (!devices) {
       const { data: admin } = await supabaseServer
         .from('admin_users')
         .select('webauthn_devices')
         .eq('admin_code', userId)
         .maybeSingle();
       devices = admin?.webauthn_devices;
    }

    if (!devices || !Array.isArray(devices)) {
      return res.status(404).json({ error: "User or device not found" });
    }

    const device = (devices as any[]).find((d: any) => d.credentialID === body.id);
    if (!device) return res.status(400).json({ error: "Device mismatch" });

    const verification = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge: challengeData.challenge,
      expectedOrigin: req.headers.origin as string || `https://${req.headers.host}`,
      expectedRPID: req.headers.host?.split(':')[0] || 'localhost',
      credential: {
        id: device.credentialID,
        publicKey: device.credentialPublicKey,
        counter: device.counter,
        transports: device.transports,
      },
    });

    if (verification.verified) {
      // Cleanup challenge
      const { error: delErr } = await supabaseServer.from('webauthn_challenges').delete().eq('user_id', userId);
      if (delErr) console.warn("Failed to delete challenge:", delErr.message);

      // Generate JWT
      const token = jwt.sign({ userId }, process.env.SUPABASE_JWT_SECRET || "secret", { expiresIn: "1h" });
      res.json({ verified: true, token });
    } else {
      res.status(400).json({ verified: false });
    }
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}
