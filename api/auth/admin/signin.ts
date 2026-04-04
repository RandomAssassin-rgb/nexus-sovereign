import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseServer } from '../../_lib/supabase';
import * as bcrypt from 'bcryptjs';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { admin_code, password } = req.body;
    if (!admin_code || !password) {
      return res.status(400).json({ success: false, message: "Admin code and password are required." });
    }

    // 1. Find user by code
    const { data: users, error: userErr } = await supabaseServer
      .from("admin_users")
      .select("*")
      .eq("admin_code", admin_code.trim());

    if (userErr || !users || users.length === 0) {
      return res.status(400).json({ success: false, message: "invalid" });
    }

    // 2. Find one whose password matches
    let matched = null;
    for (const u of users) {
      if (u.password_hash && await bcrypt.compare(password, u.password_hash)) {
        matched = u;
        break;
      }
    }
    
    if (!matched) return res.status(401).json({ success: false, message: "password wrong" });

    res.json({ 
      success: true, 
      admin: { 
        id: matched.id, 
        role: matched.role, 
        face_descriptor: matched.face_descriptor 
      } 
    });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message });
  }
}
