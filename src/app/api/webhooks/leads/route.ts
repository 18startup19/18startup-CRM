import { NextRequest } from "next/server";
import { intakeLead } from "@/lib/intake";

// Public web-to-lead endpoint. Accepts JSON or form-encoded posts.
// Body shape:
//   { name: string, phone?: string, email?: string, source?: string, custom?: {...} }
// Additional keys map into `custom` if they match a custom_field key.
export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  const ct = req.headers.get("content-type") ?? "";
  try {
    if (ct.includes("application/json")) {
      body = await req.json();
    } else {
      const fd = await req.formData();
      fd.forEach((v, k) => (body[k] = String(v)));
    }
  } catch {
    return Response.json({ ok: false, error: "invalid body" }, { status: 400 });
  }

  const name = String(body.name ?? "").trim();
  if (!name) return Response.json({ ok: false, error: "name required" }, { status: 400 });

  const known = new Set(["name", "phone", "email", "source", "custom"]);
  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (!known.has(k)) extra[k] = v;
  }
  const custom = { ...(body.custom as object ?? {}), ...extra };

  const res = await intakeLead({
    name,
    phone: body.phone ? String(body.phone) : null,
    email: body.email ? String(body.email) : null,
    source: (body.source as "web_form" | "api" | undefined) ?? "web_form",
    custom,
  });

  if (!res.ok) return Response.json({ ok: false, error: res.error }, { status: 500 });
  return Response.json({ ok: true, leadId: res.leadId });
}

export async function GET() {
  return Response.json({ ok: true, hint: "POST { name, phone?, email?, source?, ...custom }" });
}
