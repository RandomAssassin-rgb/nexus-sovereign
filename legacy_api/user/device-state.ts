import type { VercelRequest, VercelResponse } from "@vercel/node";
import { buildDeviceTrustReport } from "../_lib/v2";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  try {
    const trust = buildDeviceTrustReport(req.body || {});
    return res.status(200).json({
      success: true,
      device: req.body || {},
      trust,
      captured_at: new Date().toISOString(),
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Device state capture failed" });
  }
}
