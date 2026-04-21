import type { VercelRequest, VercelResponse } from "@vercel/node";
import { buildPayoutExplanation } from "../../_lib/v2";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method Not Allowed" });

  try {
    const claimId = Array.isArray(req.query.claimId) ? req.query.claimId[0] : req.query.claimId;
    if (!claimId) return res.status(400).json({ error: "Missing claimId" });

    const explanation = await buildPayoutExplanation(String(claimId));
    return res.status(200).json(explanation);
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Claim explanation failed" });
  }
}
