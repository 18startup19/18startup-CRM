import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Server-only client using the service role key. Bypasses RLS entirely; all
// access control happens in server routes via session cookie checks + rbac.ts.
// NEVER import this from a "use client" component.
//
// We intentionally use an untyped Supabase client here — the strict Database
// generic in @supabase/supabase-js v2 has a very rigid shape (Views/Functions/
// Enums/CompositeTypes all required) that isn't worth maintaining by hand. All
// callers cast raw results to the row types in ./database.types.ts.

let _client: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing Supabase env vars. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  _client = createClient(url, key, {
    auth: { persistSession: false },
  });

  return _client;
}
