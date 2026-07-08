import { unstable_cache } from "next/cache";
import { supabaseAdmin } from "./supabase-admin";

// Distinct tag values used across all leads — the suggestion set behind the
// Kanban tag filter, the lead form's tag chip input, etc. Formerly, every
// route computed this fresh by pulling 5000 lead rows. Cached for 60s and
// invalidated on any lead insert/update via the "leads" cache tag.

async function fetchTagSuggestions(): Promise<string[]> {
  const sb = supabaseAdmin();
  const { data } = await sb.from("leads").select("tags").limit(5000);
  const set = new Set<string>();
  for (const row of (data ?? []) as { tags: string[] | null }[]) {
    for (const t of row.tags ?? []) set.add(t);
  }
  return Array.from(set).sort();
}

export const getTagSuggestions = unstable_cache(
  fetchTagSuggestions,
  ["tag-suggestions"],
  { revalidate: 60, tags: ["leads-tags"] },
);
