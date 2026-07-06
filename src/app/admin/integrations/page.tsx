import { PageHeader } from "@/components/page-header";
import { Card, Badge } from "@/components/ui/card";
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

  const active = (p: string) => p !== "mock" && p !== "";

  return (
    <>
      <PageHeader
        title="Integrations"
        subtitle="What each channel is currently sending through. Configure via Vercel environment variables."
      />
      <div className="p-8 grid grid-cols-2 gap-4">
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
