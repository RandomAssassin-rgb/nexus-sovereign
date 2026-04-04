import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { supabaseServer } from '../../_lib/supabase';
import jwt from "jsonwebtoken";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { userId, body } = req.body;
    
    // Fetch expected challenge
    const { data: challengeData, error: challengeErr } = await supabaseServer
      .from('webauthn_challenges')
      .select('challenge')
      .eq('user_id', userId)
      .maybeSingle();

    if (challengeErr || !challengeData) {
      return res.status(400).json({ error: "Missing challenge for this user" });
    }

    const verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge: challengeData.challenge,
      expectedOrigin: req.headers.origin as string || `https://${req.headers.host}`,
      expectedRPID: req.headers.host?.split(':')[0] || 'localhost',
    });

    if (verification.verified && verification.registrationInfo) {
      const { credential } = verification.registrationInfo;
      const device = { 
        credentialID: credential.id, 
        credentialPublicKey: credential.publicKey, 
        counter: 0 
      };

      // Store device in users table (assuming userId is partnerId)
      // We check if it's an admin first or just worker? 
      // The demo logic seems to use partnerId as userId.
      const { error: updateErr } = await supabaseServer
        .from('users')
        .update({ webauthn_devices: [device], biometric_status: 'verified' })
        .eq('partnerId', userId);

      if (updateErr) {
        // Try admin_users if users fail? 
        await supabaseServer
          .from('admin_users')
          .update({ webauthn_devices: [device], biometric_verified: true })
          .eq('admin_code', userId);
      }
      
      // Cleanup challenge
      await supabaseServer.from('webauthn_challenges').delete().eq('user_id', userId);

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
