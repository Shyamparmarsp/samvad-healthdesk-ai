/// <reference types="vite/client" />
/**
 * Browser Supabase Client Stub
 * In M2 (mock API phase), api.ts handles all requests via synthetic mocks.
 * Real Supabase client connection is integrated in M4.
 */

// Placeholder configuration check
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY || '';

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);

// Null client placeholder for M2
export const supabase = null;
