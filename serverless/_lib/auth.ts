import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Verifies a Supabase JWT from the Authorization header.
 * Returns the user object if valid, otherwise throws an error.
 */
export async function verifyUser(req: VercelRequest) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing or invalid Authorization header');
  }

  const token = authHeader.split(' ')[1];
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    throw new Error('Unauthorized');
  }

  return user;
}

/**
 * Verifies if the request presents a valid Admin secret or an Admin session.
 */
export async function verifyAdmin(req: VercelRequest) {
  const adminSecret = process.env.ADMIN_SECRET_KEY || 'nexus-master-gate';
  const providedSecret = req.headers['x-admin-secret'];

  if (providedSecret === adminSecret) {
    return { role: 'admin', method: 'secret' };
  }

  // Fallback to JWT role check if implemented
  const user = await verifyUser(req);
  if (user.user_metadata?.role !== 'admin' && user.email !== process.env.ADMIN_EMAIL) {
    throw new Error('Forbidden: Admin access required');
  }

  return { ...user, role: 'admin', method: 'jwt' };
}
