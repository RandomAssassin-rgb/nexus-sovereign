import { supabaseServer } from './supabase.js';

export type AuthDiagnosticCode = 
  | 'DB_TABLES_MISSING'
  | 'DB_SCHEMA_MISMATCH'
  | 'DB_ACCESS_DENIED'
  | 'SUPABASE_CONFIG_INVALID'
  | 'AUTH_QUERY_FAILED'
  | 'READY';

export interface AuthHealthResult {
  status: AuthDiagnosticCode;
  details?: string;
  isRecoverable: boolean;
}

/**
 * Performs a deep health check of the admin authentication infrastructure.
 */
export async function diagnoseAuthSystem(): Promise<AuthHealthResult> {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || url.includes('example.supabase.co') || !key || key === 'fake_key') {
    return { 
      status: 'SUPABASE_CONFIG_INVALID', 
      details: 'Missing or default Supabase environment variables in backend.',
      isRecoverable: false
    };
  }

  try {
    // 1. Check if admin_users exists and has correct columns
    // We do a minimal select to probe the schema
    const { error: schemaErr } = await supabaseServer
      .from('admin_users')
      .select('id, admin_code, password_hash, role')
      .limit(0);

    if (schemaErr) {
      if (schemaErr.code === 'PGRST116') { // Table missing
        return { 
          status: 'DB_TABLES_MISSING', 
          details: 'Table [admin_users] was not found in the public schema.',
          isRecoverable: true 
        };
      }
      if (schemaErr.message.includes('column') || schemaErr.code === '42703') {
        return { 
          status: 'DB_SCHEMA_MISMATCH', 
          details: `Column mismatch in [admin_users]: ${schemaErr.message}`,
          isRecoverable: true 
        };
      }
      if (schemaErr.code === '42501') {
        return { 
          status: 'DB_ACCESS_DENIED', 
          details: 'Service role key has insufficient permissions for [admin_users].',
          isRecoverable: false 
        };
      }
      return { 
        status: 'AUTH_QUERY_FAILED', 
        details: schemaErr.message,
        isRecoverable: true 
      };
    }

    // 2. Check admin_codes
    const { error: codeErr } = await supabaseServer
      .from('admin_codes')
      .select('code')
      .limit(0);

    if (codeErr) {
      return { 
        status: 'DB_TABLES_MISSING', 
        details: 'Table [admin_codes] is missing or inaccessible.',
        isRecoverable: true 
      };
    }

    return { status: 'READY', isRecoverable: true };
  } catch (err: any) {
    return { 
      status: 'AUTH_QUERY_FAILED', 
      details: err.message,
      isRecoverable: true 
    };
  }
}
