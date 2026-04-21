import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getProductControls, saveProductControls } from "../_lib/v2";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    if (req.method === "GET") {
      return res.status(200).json({
        success: true,
        controls: getProductControls(),
      });
    }

    if (req.method === "POST") {
      const next = saveProductControls(req.body || {});
      return res.status(200).json({
        success: true,
        controls: next,
      });
    }

    return res.status(405).json({ error: "Method Not Allowed" });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Product control update failed" });
  }
}
