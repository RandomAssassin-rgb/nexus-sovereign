import type { VercelRequest, VercelResponse } from "@vercel/node";
import { buildFraudMesh } from "../_lib/v2";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method Not Allowed" });

  try {
    const payload = await buildFraudMesh();
    return res.json(payload);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || "Fraud mesh failed" });
  }
}
