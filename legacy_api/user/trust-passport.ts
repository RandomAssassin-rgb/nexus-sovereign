import type { VercelRequest, VercelResponse } from "@vercel/node";
import { buildTrustPassport } from "../_lib/v2";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method Not Allowed" });

  try {
    const partnerId = String(req.query.partnerId || req.headers["x-partner-id"] || "");
    const payload = await buildTrustPassport(partnerId || null);
    return res.json(payload);
  } catch (error: any) {
    console.error("[TrustPassport] API Crash:", error);
    return res.status(500).json({ 
      error: error.message || "Trust passport failed",
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined 
    });
  }
}
