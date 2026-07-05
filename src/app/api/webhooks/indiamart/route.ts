import { NextRequest } from "next/server";
import { intakeLead } from "@/lib/intake";

// IndiaMART "Lead Manager Push API" webhook. Fields vary by account; typical
// keys: SENDER_NAME, SENDER_MOBILE, SENDER_EMAIL, SUBJECT, QUERY_MESSAGE.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return Response.json({ ok: false }, { status: 400 });

  const name = String(body.SENDER_NAME ?? body.name ?? "").trim();
  if (!name) return Response.json({ ok: false, error: "name required" }, { status: 400 });

  const res = await intakeLead({
    name,
    phone: (body.SENDER_MOBILE ?? body.phone) as string | undefined,
    email: (body.SENDER_EMAIL ?? body.email) as string | undefined,
    source: "indiamart",
    custom: {
      indiamart_subject: body.SUBJECT,
      indiamart_query: body.QUERY_MESSAGE,
      indiamart_queried_product: body.QUERY_PRODUCT_NAME,
      indiamart_query_id: body.QUERY_ID,
    },
  });
  return Response.json({ ok: res.ok });
}
