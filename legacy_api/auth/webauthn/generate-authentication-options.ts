import type { VercelRequest, VercelResponse } from '@vercel/node';
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { supabaseServer } from '../../_lib/supabase';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: "Missing userId" });

    // Fetch user device from either users or admin_users
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

    const options = await generateAuthenticationOptions({
      rpID: req.headers.host?.split(':')[0] || 'localhost',
      allowCredentials: devices.map((dev: any) => ({
        id: dev.credentialID,
        type: "public-key",
        transports: ["internal"],
      })),
      userVerification: "preferred",
    });

    // Store challenge
    await supabaseServer
      .from('webauthn_challenges')
      .upsert({ user_id: userId, challenge: options.challenge }, { onConflict: 'user_id' });

    res.json(options);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
