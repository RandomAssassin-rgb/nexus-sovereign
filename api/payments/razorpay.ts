import type { VercelRequest, VercelResponse } from '@vercel/node';
import Razorpay from "razorpay";
import crypto from "crypto";
import { supabaseServer } from '../_lib/supabase';

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || "rzp_test_default",
  key_secret: process.env.RAZORPAY_KEY_SECRET || "default_secret"
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  try {
    const { action } = req.query;

    if (action === "create-order") {
      const { amount, partnerId } = req.body;
      const order = await razorpay.orders.create({
        amount: amount * 100, // INR to paise
        currency: "INR",
        receipt: `receipt_${partnerId}_${Date.now()}`
      });
      return res.json(order);
    }

    if (action === "verify") {
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature, partnerId, amount } = req.body;
      const sign = razorpay_order_id + "|" + razorpay_payment_id;
      const expectedSign = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "default_secret").update(sign.toString()).digest("hex");

      if (expectedSign === razorpay_signature) {
         // Update Balance and Transaction
         const { data: user } = await supabaseServer.from('users').select('balance').eq('partnerId', partnerId).maybeSingle();
         if (user) {
            await supabaseServer.from('users').update({ balance: Number(user.balance || 0) + amount }).eq('partnerId', partnerId);
            await supabaseServer.from('transactions').insert({
              worker_id: partnerId,
              amount,
              type: 'credit',
              status: 'completed',
              reference_id: razorpay_payment_id,
              description: 'Razorpay Direct Top-up',
              title: 'Wallet Reload',
              via: 'Razorpay Gateway'
            });
         }
         return res.json({ success: true, message: "Payment verified successfully" });
      } else {
         return res.status(400).json({ success: false, message: "Invalid signature" });
      }
    }

    res.status(400).json({ error: "Invalid action" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
