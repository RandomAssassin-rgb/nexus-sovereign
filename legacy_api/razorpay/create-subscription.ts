import type { VercelRequest, VercelResponse } from '@vercel/node';
import Razorpay from 'razorpay';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const keyId = process.env.RAZORPAY_KEY_ID || process.env.VITE_RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  const planId = process.env.RAZORPAY_PLAN_ID;

  if (!keyId || !keySecret || !planId) {
    return res.json({
      id: `sub_${Math.random().toString(36).slice(2, 10)}`,
      status: 'created',
      short_url: 'https://rzp.io/i/mock',
      mock: true,
    });
  }

  try {
    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
    const subscription = await razorpay.subscriptions.create({
      plan_id: planId,
      customer_notify: 1,
      total_count: 12,
      start_at: Math.floor(Date.now() / 1000) + 3600,
    });

    return res.json(subscription);
  } catch (error) {
    return res.json({
      id: `sub_${Math.random().toString(36).slice(2, 10)}`,
      status: 'created',
      short_url: 'https://rzp.io/i/mock',
      mock: true,
    });
  }
}
