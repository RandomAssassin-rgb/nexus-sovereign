import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseServer } from '../../_lib/supabase';
import * as bcrypt from 'bcryptjs';
import { diagnoseAuthSystem } from '../../_lib/authDiagnostics';

function normalizeAdminCode(value: string) {
  const trimmed = value.trim().toUpperCase();
  const shortMatch = trimmed.match(/^NEXUS-(\d{4})$/);
  if (shortMatch) return `NEXUS-ADMIN-${shortMatch[1]}`;
  return trimmed;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { admin_code, password } = req.body;
    if (!admin_code || !password) {
      return res.status(400).json({ success: false, message: "Admin code and password are required." });
    }

    const normalizedCode = normalizeAdminCode(admin_code);

    // Standard lookup
    const { data: users, error: userErr } = await supabaseServer
      .from("admin_users")
      .select("*")
      .eq("admin_code", normalizedCode);

    if (userErr) {
      const health = await diagnoseAuthSystem();
      return res.status(500).json({ 
        success: false, 
        message: "Database error during authentication.",
        diagnostic: health.status,
        details: health.details
      });
    }

    if (!users || users.length === 0) {
      // Check for systemic failure
      const health = await diagnoseAuthSystem();
      if (health.status !== 'READY') {
          return res.status(500).json({
              success: false,
              message: "System infrastructure issue detected.",
              diagnostic: health.status,
              details: health.details
          });
      }
      return res.status(400).json({ success: false, message: "invalid" });
    }

    let matched = null;
    const candidates = [];
    for (const u of users) {
      if (u.password_hash && await bcrypt.compare(password, u.password_hash)) {
        candidates.push(u);
      }
    }
    
    if (!candidates.length) return res.status(401).json({ success: false, message: "password wrong" });

    matched = [...candidates].sort((left, right) => {
      const leftScore = Number(Boolean(left.face_descriptor)) + Number(Boolean(left.biometric_verified));
      const rightScore = Number(Boolean(right.face_descriptor)) + Number(Boolean(right.biometric_verified));
      if (rightScore !== leftScore) return rightScore - leftScore;
      return new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime();
    })[0];

    res.json({ 
      success: true, 
      admin: { 
        id: matched.id, 
        role: matched.role, 
        face_descriptor: matched.face_descriptor 
      } 
    });
  } catch (e: any) {
    const health = await diagnoseAuthSystem();
    res.status(500).json({ 
      success: false, 
      message: e.message,
      diagnostic: health.status === 'READY' ? 'AUTH_QUERY_FAILED' : health.status,
      details: health.details || e.message
    });
  }
}
