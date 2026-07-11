// Read-only Webflow REST API v2 adapter. Used from the admin Lead Routing
// page to list forms and their field schemas so admins can configure
// routing + field mapping BEFORE any real submission arrives.
//
// Auth: Bearer token in WEBFLOW_API_TOKEN, scoped read-only for
// forms + sites. WEBFLOW_SITE_ID limits queries to one site.

export interface WebflowFormField {
  displayName: string;
  slug: string;
  type: string;
  userVisible?: boolean;
}

export interface WebflowForm {
  id: string;
  displayName: string;
  siteId: string;
  createdOn?: string;
  lastUpdated?: string;
  fields: Record<string, WebflowFormField>;
}

export interface FetchFormsResult {
  ok: boolean;
  forms: WebflowForm[];
  error?: string;
}

// Fetch every form on the configured Webflow site. Returns forms with
// their field schemas so the admin UI can render mapping dropdowns.
// Fails soft — the admin UI shows an error banner instead of a 500.
export async function fetchWebflowForms(): Promise<FetchFormsResult> {
  const token = process.env.WEBFLOW_API_TOKEN;
  const siteId = process.env.WEBFLOW_SITE_ID;
  if (!token) {
    return { ok: false, forms: [], error: "WEBFLOW_API_TOKEN not configured." };
  }
  if (!siteId) {
    return { ok: false, forms: [], error: "WEBFLOW_SITE_ID not configured." };
  }

  try {
    const res = await fetch(
      `https://api.webflow.com/v2/sites/${siteId}/forms`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "accept-version": "2.0.0",
        },
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        ok: false,
        forms: [],
        error: `Webflow API ${res.status}: ${text.slice(0, 200)}`,
      };
    }
    const body = (await res.json().catch(() => null)) as {
      forms?: WebflowForm[];
    } | null;
    return { ok: true, forms: body?.forms ?? [] };
  } catch (err) {
    return {
      ok: false,
      forms: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
