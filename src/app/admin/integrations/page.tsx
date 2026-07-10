import { PageHeader } from "@/components/page-header";
import { Card, Badge } from "@/components/ui/card";
import { EnvRow } from "@/components/admin/env-row";
import { CollapsibleCard } from "@/components/admin/collapsible-card";
import { headers } from "next/headers";

const PROVIDER_LABEL: Record<string, string> = {
  mock: "Not configured (mock)",
  sendgrid: "Twilio SendGrid",
  ses: "Amazon SES",
  twilio: "Twilio WhatsApp",
  gupshup: "Gupshup",
  interakt: "Interakt",
  aisensy: "AiSensy",
  wati: "Wati",
  callerdesk: "CallerDesk",
  exotel: "Exotel",
  knowlarity: "Knowlarity",
  myoperator: "MyOperator",
  ozonetel: "Ozonetel",
};

function label(provider: string): string {
  return PROVIDER_LABEL[provider] ?? provider;
}

async function baseUrl(): Promise<string> {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (envUrl) return envUrl.replace(/\/$/, "");
  // Derive from the request host so the URLs shown here match the live host
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "your-crm.example.com";
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

export default async function IntegrationsPage() {
  const emailProvider = (process.env.EMAIL_PROVIDER ?? "mock").toLowerCase();
  const whatsappProvider = (process.env.WHATSAPP_PROVIDER ?? "mock").toLowerCase();
  const telephonyProvider = (process.env.TELEPHONY_PROVIDER ?? "mock").toLowerCase();
  const base = await baseUrl();

  const lmsApiUrl = process.env.LMS_API_URL ?? "";
  const lmsApiKey = process.env.LMS_API_KEY ?? "";
  const lmsWebhookSecret = process.env.LMS_WEBHOOK_SECRET ?? "";
  const lmsOutboundConfigured = !!lmsApiUrl && !!lmsApiKey;
  const lmsInboundConfigured = !!lmsWebhookSecret;

  const razorpaySecret = process.env.RAZORPAY_WEBHOOK_SECRET ?? "";
  const webflowSecret = process.env.WEBFLOW_WEBHOOK_SECRET ?? "";

  const active = (p: string) => p !== "mock" && p !== "";

  return (
    <>
      <PageHeader
        title="Integrations"
        subtitle="What each channel is currently sending through. Configure via Vercel environment variables."
      />
      <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-brand-charcoal">Email</h3>
            <Badge color={active(emailProvider) ? "green" : "slate"}>
              {label(emailProvider)}
            </Badge>
          </div>
          <p className="text-[13px] text-brand-dark-text mb-3">
            {active(emailProvider)
              ? `Emails are delivered via ${label(emailProvider)}. From address: ${process.env.EMAIL_FROM_ADDRESS ?? "(not set)"}.`
              : "Set EMAIL_PROVIDER (sendgrid | ses) in Vercel env vars."}
          </p>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-brand-charcoal">WhatsApp Business</h3>
            <Badge color={active(whatsappProvider) ? "green" : "slate"}>
              {label(whatsappProvider)}
            </Badge>
          </div>
          <p className="text-[13px] text-brand-dark-text mb-3">
            {active(whatsappProvider)
              ? `Sends via ${label(whatsappProvider)}. Inbound webhook receiver:`
              : "Set WHATSAPP_PROVIDER (twilio | gupshup | interakt | aisensy | wati) in Vercel env vars."}
          </p>
          <code className="block text-[12px] bg-brand-bg border border-brand-border rounded px-3 py-2 font-mono break-all">
            {base}/api/webhooks/twilio-whatsapp
          </code>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-brand-charcoal">Telephony</h3>
            <Badge color={active(telephonyProvider) ? "green" : "slate"}>
              {label(telephonyProvider)}
            </Badge>
          </div>
          <p className="text-[13px] text-brand-dark-text mb-3">
            {active(telephonyProvider)
              ? `Click-to-call routed through ${label(telephonyProvider)}. Register this URL as their webhook:`
              : "Set TELEPHONY_PROVIDER (callerdesk | exotel | knowlarity | myoperator | ozonetel) in Vercel env vars."}
          </p>
          <code className="block text-[12px] bg-brand-bg border border-brand-border rounded px-3 py-2 font-mono break-all">
            {base}/api/webhooks/telephony
          </code>
        </Card>

        <CollapsibleCard
          title="LMS onboarding"
          summary="Two-way integration with your LMS. Click for the outbound (CRM→LMS) enrollment payload and the inbound (LMS→CRM) cohort-sync webhook — env vars, response codes, and a smoke-test curl."
          headerRight={
            <>
              <Badge color={lmsOutboundConfigured ? "green" : "slate"}>
                {lmsOutboundConfigured ? "Outbound configured" : "Outbound missing"}
              </Badge>
              <Badge color={lmsInboundConfigured ? "green" : "slate"}>
                {lmsInboundConfigured ? "Inbound configured" : "Inbound missing"}
              </Badge>
            </>
          }
        >
          {/* ── Outbound: CRM → LMS ──────────────────────────── */}
          <div className="mt-4 rounded-[10px] border border-brand-border p-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.8px] text-brand-dark-text mb-2">
              Outbound · CRM → LMS
            </div>
            <p className="text-[12.5px] text-brand-dark-text mb-3">
              Fires when Sales clicks &ldquo;Onboard to LMS&rdquo; on a
              converted lead. CRM POSTs the payload below to your LMS.
            </p>
            <EnvRow name="LMS_API_URL" value={lmsApiUrl} />
            <EnvRow name="LMS_API_KEY" value={lmsApiKey} secret />
            <div className="mt-3 text-[11px] font-bold uppercase tracking-[0.4px] text-brand-dark-text">
              Request body (JSON)
            </div>
            <pre className="text-[12px] bg-brand-bg border border-brand-border rounded px-3 py-2 font-mono overflow-x-auto mt-1">{`{
  "email": "lead@example.com",
  "name": "Priya Ramaswamy",
  "phone": "+918886956636",
  "cohort_id": "<LMS UUID from the cohort's lms_cohort_id>",
  "cohort_number": "c27",
  "cohort_label": "3 Months Online Fellowship",
  "source": "crm"
}`}</pre>
            <div className="mt-3 text-[11px] font-bold uppercase tracking-[0.4px] text-brand-dark-text">
              Expected response
            </div>
            <ul className="text-[12.5px] text-brand-dark-text mt-1 space-y-1">
              <li>
                <strong>200</strong> <code className="font-mono">{`{ "user_id": "..." }`}</code>{" "}
                — enrollment succeeded. Resends for the same
                (cohort_id, email) should also return 200.
              </li>
              <li>
                <strong>4xx / 5xx</strong>{" "}
                <code className="font-mono">{`{ "error": "..." }`}</code> —
                message is shown verbatim in the CRM&apos;s Retry tooltip.
              </li>
            </ul>
          </div>

          {/* ── Inbound: LMS → CRM ───────────────────────────── */}
          <div className="mt-4 rounded-[10px] border border-brand-border p-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.8px] text-brand-dark-text mb-2">
              Inbound · LMS → CRM (cohort sync)
            </div>
            <p className="text-[12.5px] text-brand-dark-text mb-3">
              Give these to your LMS dev. The LMS should call this URL on
              every cohort create, update, or archive — the CRM upserts by{" "}
              <code>cohort_id</code>, so re-fires are safe.
            </p>
            <EnvRow
              name="CRM_WEBHOOK_URL"
              value={`${base}/api/webhooks/lms-cohort`}
              hint="Store on the LMS side as CRM_WEBHOOK_URL"
            />
            <EnvRow
              name="CRM_WEBHOOK_KEY"
              value={lmsWebhookSecret}
              secret
              hint="Bearer token. Store on the LMS side as CRM_WEBHOOK_KEY. Rotate by updating LMS_WEBHOOK_SECRET here + the LMS's env at the same time."
            />
            <div className="mt-3 text-[11px] font-bold uppercase tracking-[0.4px] text-brand-dark-text">
              Request body (JSON)
            </div>
            <pre className="text-[12px] bg-brand-bg border border-brand-border rounded px-3 py-2 font-mono overflow-x-auto mt-1">{`{
  "cohort_id": "<LMS UUID>",
  "number": "c27",
  "label": "3 Months Online Fellowship",
  "is_active": true
}`}</pre>
            <div className="mt-3 text-[11px] font-bold uppercase tracking-[0.4px] text-brand-dark-text">
              Response codes
            </div>
            <ul className="text-[12.5px] text-brand-dark-text mt-1 space-y-1">
              <li>
                <strong>200</strong>{" "}
                <code className="font-mono">{`{ "ok": true, "action": "created" | "updated", "crm_cohort_id": "..." }`}</code>
              </li>
              <li>
                <strong>401</strong> — bad/missing bearer token.
              </li>
              <li>
                <strong>400</strong> — missing <code>cohort_id</code> or{" "}
                <code>number</code>.
              </li>
              <li>
                <strong>409</strong> — <code>number</code> collides with a
                different CRM cohort (LMS should reconcile).
              </li>
            </ul>
            <div className="mt-3 text-[11px] font-bold uppercase tracking-[0.4px] text-brand-dark-text">
              Smoke test
            </div>
            <pre className="text-[12px] bg-brand-bg border border-brand-border rounded px-3 py-2 font-mono overflow-x-auto mt-1 whitespace-pre">{`curl -X POST ${base}/api/webhooks/lms-cohort \\
  -H "Authorization: Bearer $CRM_WEBHOOK_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"cohort_id":"<some-uuid>","number":"c99","label":"Smoke test","is_active":true}'`}</pre>
          </div>
        </CollapsibleCard>

        <CollapsibleCard
          title="Razorpay payments → leads"
          summary="Every successful Razorpay payment lands as a lead (or attaches a signal to the existing one if we've seen this person before)."
          headerRight={
            <Badge color={razorpaySecret ? "green" : "slate"}>
              {razorpaySecret ? "Configured" : "Secret missing"}
            </Badge>
          }
        >
          <div className="mt-4 rounded-[10px] border border-brand-border p-4">
            <p className="text-[12.5px] text-brand-dark-text mb-3">
              In the Razorpay dashboard → Settings → Webhooks, add the URL
              below with the secret shown here, then tick <strong>only</strong>{" "}
              the <code>payment.captured</code> event. The CRM ignores
              authorized / failed / refunded events by design — the moment
              money actually moves is what makes them a qualified lead.
            </p>
            <EnvRow
              name="Webhook URL"
              value={`${base}/api/webhooks/razorpay`}
              hint="Paste into Razorpay dashboard → Settings → Webhooks."
            />
            <EnvRow
              name="RAZORPAY_WEBHOOK_SECRET"
              value={razorpaySecret}
              secret
              hint="Same value in the Razorpay dashboard and CRM env. Rotate both together."
            />
            <div className="mt-3 text-[11px] font-bold uppercase tracking-[0.4px] text-brand-dark-text">
              Signature verification
            </div>
            <p className="text-[12.5px] text-brand-dark-text mt-1">
              CRM verifies <code>X-Razorpay-Signature</code> as{" "}
              HMAC-SHA256(raw body, secret) in constant time. Any mismatch
              returns <code>401</code> before any DB write.
            </p>
            <div className="mt-3 text-[11px] font-bold uppercase tracking-[0.4px] text-brand-dark-text">
              What lands as a lead
            </div>
            <ul className="text-[12.5px] text-brand-dark-text mt-1 space-y-1">
              <li>
                <strong>name</strong>: from{" "}
                <code>payload.payment.entity.notes.name</code> if provided,
                else derived from the email.
              </li>
              <li>
                <strong>phone</strong>, <strong>email</strong>: from{" "}
                <code>entity.contact</code> and <code>entity.email</code>.
              </li>
              <li>
                <strong>source</strong>: <code>razorpay</code>.
              </li>
              <li>
                <strong>custom</strong>: payment id, order id, amount (in ₹),
                currency, method, description, plus any Razorpay checkout{" "}
                <code>notes</code> keys.
              </li>
            </ul>
            <div className="mt-3 text-[11px] font-bold uppercase tracking-[0.4px] text-brand-dark-text">
              Response codes
            </div>
            <ul className="text-[12.5px] text-brand-dark-text mt-1 space-y-1">
              <li>
                <strong>200</strong>{" "}
                <code>{`{ "ok": true, "action": "created" | "merged" | "ignored" }`}</code>{" "}
                — <code>ignored</code> = it wasn&apos;t a captured event.
              </li>
              <li>
                <strong>401</strong> — bad signature.
              </li>
              <li>
                <strong>400</strong> — malformed body.
              </li>
              <li>
                <strong>500</strong> — CRM couldn&apos;t save; Razorpay will retry.
              </li>
            </ul>
          </div>
        </CollapsibleCard>

        <CollapsibleCard
          title="Webflow forms → leads"
          summary="Any Webflow form submission becomes a lead. Person-level dedup by email or phone means the same person filling twice won't create a duplicate — the second submission is logged as an activity on the first."
          headerRight={
            <Badge color={webflowSecret ? "green" : "slate"}>
              {webflowSecret ? "Configured" : "Secret missing"}
            </Badge>
          }
        >
          <div className="mt-4 rounded-[10px] border border-brand-border p-4">
            <p className="text-[12.5px] text-brand-dark-text mb-3">
              In Webflow → site settings → Integrations → Webhooks, add a{" "}
              <code>form_submission</code> webhook pointing at the URL below.
              Webflow generates its own signing secret when the webhook is
              created — paste that into the CRM env below.
            </p>
            <EnvRow
              name="Webhook URL"
              value={`${base}/api/webhooks/webflow`}
              hint="Paste into Webflow → Integrations → Webhooks."
            />
            <EnvRow
              name="WEBFLOW_WEBHOOK_SECRET"
              value={webflowSecret}
              secret
              hint="Copy the secret Webflow shows when creating the webhook. Store here."
            />
            <div className="mt-3 text-[11px] font-bold uppercase tracking-[0.4px] text-brand-dark-text">
              Signature verification
            </div>
            <p className="text-[12.5px] text-brand-dark-text mt-1">
              CRM verifies <code>x-webflow-signature</code> as{" "}
              HMAC-SHA256(<code>x-webflow-timestamp</code>:body, secret).
              Requests older than 5 minutes are rejected as replay attempts.
            </p>
            <div className="mt-3 text-[11px] font-bold uppercase tracking-[0.4px] text-brand-dark-text">
              Field mapping
            </div>
            <p className="text-[12.5px] text-brand-dark-text mt-1 mb-2">
              CRM looks up the following field names case-insensitively; name
              your Webflow form fields to match and everything Just Works:
            </p>
            <ul className="text-[12.5px] text-brand-dark-text space-y-1">
              <li>
                <strong>Name</strong>: <code>name</code>,{" "}
                <code>full name</code>, <code>fullname</code>,{" "}
                <code>your name</code>, <code>first name</code>
              </li>
              <li>
                <strong>Email</strong>: <code>email</code>,{" "}
                <code>email address</code>, <code>your email</code>
              </li>
              <li>
                <strong>Phone</strong>: <code>phone</code>,{" "}
                <code>phone number</code>, <code>mobile</code>,{" "}
                <code>whatsapp</code>
              </li>
              <li>
                <strong>Everything else</strong> (utm_source, page, custom
                dropdowns, etc.) → stored in the lead&apos;s{" "}
                <code>custom</code> bag as-is.
              </li>
            </ul>
            <div className="mt-3 text-[11px] font-bold uppercase tracking-[0.4px] text-brand-dark-text">
              Tip: capture UTM + page
            </div>
            <p className="text-[12.5px] text-brand-dark-text mt-1">
              Add hidden fields <code>utm_source</code>,{" "}
              <code>utm_campaign</code>, <code>utm_medium</code>, and{" "}
              <code>page_url</code> to your Webflow form and populate them via
              site-embed JS. They&apos;ll flow through to the lead&apos;s
              custom fields for attribution.
            </p>
          </div>
        </CollapsibleCard>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-brand-charcoal">Public lead intake</h3>
            <Badge color="green">Enabled</Badge>
          </div>
          <p className="text-[13px] text-brand-dark-text mb-3">
            Route website form submissions or third-party ads directly into the CRM
            by POSTing JSON with <code>name</code> (required) plus optional{" "}
            <code>phone</code>, <code>email</code>, <code>source</code>, and{" "}
            <code>custom</code> (object). Missing fields default sensibly.
          </p>
          <code className="block text-[12px] bg-brand-bg border border-brand-border rounded px-3 py-2 font-mono break-all mb-2">
            POST {base}/api/webhooks/leads
          </code>
          <p className="text-[12px] text-brand-dark-text mt-3">
            Also available: Facebook Lead Ads →{" "}
            <code>/api/webhooks/facebook-lead-ads</code> · IndiaMART →{" "}
            <code>/api/webhooks/indiamart</code>
          </p>
        </Card>
      </div>
    </>
  );
}
