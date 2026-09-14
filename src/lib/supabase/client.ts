"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase browser client (lazy, cached).
 * Supabase JS v2: https://supabase.com/docs/reference/javascript/initializing
 * - createBrowserClient wires cookie-based sessions for Next.js.
 * - Validation happens inside the factory so module import can never throw
 *   during prerender (root cause of the previous broken production build).
 */

type BrowserClient = ReturnType<typeof createBrowserClient>;

let cached: BrowserClient | null = null;

export function createClient(): BrowserClient {
  if (cached) return cached;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing Supabase environment variables. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }

  cached = createBrowserClient(supabaseUrl, supabaseAnonKey);
  return cached;
}
