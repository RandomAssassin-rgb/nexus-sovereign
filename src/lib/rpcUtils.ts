import { supabase } from './supabase';

/**
 * Detects if the Supabase project has the 'exec_sql' RPC enabled.
 * This is used to determine if we can perform automated schema corrections.
 */
export async function detectExecSqlSupport(): Promise<boolean> {
  try {
    const { error } = await supabase.rpc('exec_sql', { 
      query: 'SELECT 1;',
      sql_query: 'SELECT 1;' // Support common variants
    });
    
    if (error) {
      if (error.message.includes('function') && error.message.includes('not found')) {
        console.warn('[RPC Check] exec_sql not found on this project.');
        return false;
      }
      // If it's a permission error, it might still "exist" but we can't use it
      console.log(`[RPC Check] exec_sql detected but returned error: ${error.message}`);
      return false;
    }
    
    console.log('[RPC Check] ✅ exec_sql support confirmed.');
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Prints manual SQL blocks to the console for the user if RPC-based 
 * schema updates fail.
 */
export function logManualSqlRequired(title: string, sql: string) {
  console.group(`%c🛠️ MANUAL SQL REQUIRED: ${title}`, 'background: #f59e0b; color: #000; font-weight: bold; padding: 4px; border-radius: 4px;');
  console.log('Automated schema update unavailable. Please run the following in your Supabase SQL Editor:');
  console.log('%c' + sql, 'color: #3b82f6; font-family: monospace; font-size: 11px;');
  console.groupEnd();
}
