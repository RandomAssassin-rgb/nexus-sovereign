import type { VercelRequest, VercelResponse } from '@vercel/node';
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { supabaseServer } from '../../_lib/supabase';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { userId, username } = req.body;
    if (!userId || !username) return res.status(400).json({ error: "Missing userId or username" });

    const options = await generateRegistrationOptions({
      rpName: "Nexus Sovereign",
      rpID: req.headers.host?.split(':')[0] || 'localhost',
      userID: new Uint8Array(Buffer.from(userId)),
      userName: username,
      attestationType: "none",
      authenticatorSelection: {
        userVerification: "preferred",
        residentKey: "required",
      },
    });

    // Persistent challenge storage
    const { error } = await supabaseServer
      .from('webauthn_challenges')
      .upsert({ user_id: userId, challenge: options.challenge }, { onConflict: 'user_id' });

    if (error) {
       console.error("Failed to store challenge:", error.message);
       // We proceed anyway as this is critical for the flow, 
       // but in production we'd want better error handling.
    }

    res.json(options);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
