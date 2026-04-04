import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseServer } from '../_lib/supabase';
import axios from "axios";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    console.log("🛡️ Running Predictive-Shield Cron...");

    const { data: users } = await supabaseServer.from('users').select('*').limit(10);
    const results = [];

    // Trigger ML insights for sample users (Predictive Shield)
    for (const user of users || []) {
       try {
         const mlResponse = await axios.post(`${process.env.PYTHON_ML_URL || 'https://nexus-sovereign-ml.vercel.app'}/api/ml/predict/risk`, {
             user_id: user.partnerId,
             features: [user.trust_score, user.balance]
         });
         results.push({ userId: user.partnerId, risk: mlResponse.data });
       } catch (e) {
         console.warn(`[Shield] ML call failed for ${user.partnerId}`);
       }
    }

    res.json({ success: true, processed: results.length, insights: results });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
