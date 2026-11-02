/// <reference types="vite/client" />
import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Single browser Supabase client wrapper.
 * AGENTS.md invariant: src/lib/api.ts is the ONLY module permitted to call
 * Supabase Auth, .from(), .rpc() or .functions.invoke().
 * UI components must NEVER import this module directly.
 */

export const SUPABASE_URL: string =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) ||
  (typeof globalThis !== 'undefined' && (globalThis as any).process?.env?.VITE_SUPABASE_URL) ||
  '';

export const SUPABASE_KEY: string =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_KEY) ||
  (typeof globalThis !== 'undefined' && (globalThis as any).process?.env?.VITE_SUPABASE_KEY) ||
  '';

export const isSupabaseConfigured: boolean = Boolean(
  SUPABASE_URL &&
  SUPABASE_KEY &&
  SUPABASE_URL.startsWith('http') &&
  !SUPABASE_URL.includes('placeholder')
);

let clientInstance: SupabaseClient | null = null;

export function setSupabaseClient(client: SupabaseClient | null): void {
  clientInstance = client;
}

export function getSupabaseClient(): SupabaseClient {
  if (clientInstance) {
    return clientInstance;
  }

  if (!isSupabaseConfigured) {
    throw new Error(
      'Supabase client is not configured. Please supply valid VITE_SUPABASE_URL and VITE_SUPABASE_KEY variables.'
    );
  }

  clientInstance = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });

  return clientInstance;
}
