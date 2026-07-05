import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// Server-only client using the service role key. Bypasses RLS entirely; all
// access control happens in server routes via session cookie checks + rbac.ts.
// NEVER import this from a "use client" component.

let _client: ReturnType<typeof createClient<Database>> | null = null;

export function supabaseAdmin() {
  if (_client) return _client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing Supabase env vars. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  _client = createClient<Database>(url, key, {
    auth: { persistSession: false },
  });

  return _client;
}
