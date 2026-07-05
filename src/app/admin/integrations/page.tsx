import { supabaseAdmin } from "@/lib/supabase-admin";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/card";

export default async function IntegrationsPage() {
  const sb = supabaseAdmin();
  const { data } = await sb.from("integration_settings").select("*").eq("id", 1).maybeSingle();
  const s = data ?? {
    email_provider: process.env.EMAIL_PROVIDER ?? "mock",
    whatsapp_provider: process.env.WHATSAPP_PROVIDER ?? "mock",
    telephony_provider: process.env.TELEPHONY_PROVIDER ?? "mock",
  };

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://your-crm.example.com";

  return (
    <>
      <PageHeader
        title="Integrations"
        subtitle="Providers are configured via environment variables (see .env.local)."
      />
      <div className="p-8 grid grid-cols-2 gap-4">
        <Card className="p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-brand-charcoal">Email</h3>
            <Badge color={s.email_provider === "mock" ? "slate" : "green"}>
              {s.email_provider}
            </Badge>
          </div>
          <p className="text-[13px] text-brand-dark-text mb-3">
            Set <code>EMAIL_PROVIDER</code> to <code>ses</code> or <code>sendgrid</code> and
            add the corresponding credentials. Until then, sends are logged to console.
          </p>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-brand-charcoal">WhatsApp Business</h3>
            <Badge color={s.whatsapp_provider === "mock" ? "slate" : "green"}>
              {s.whatsapp_provider}
            </Badge>
          </div>
          <p className="text-[13px] text-brand-dark-text mb-3">
            Set <code>WHATSAPP_PROVIDER</code> (gupshup / interakt / aisensy / wati). Configure
            the webhook receiver at:
          </p>
          <code className="block text-[12px] bg-brand-bg border border-brand-border rounded px-3 py-2 font-mono break-all">
            {base}/api/webhooks/whatsapp
          </code>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-brand-charcoal">Telephony</h3>
            <Badge color={s.telephony_provider === "mock" ? "slate" : "green"}>
              {s.telephony_provider}
            </Badge>
          </div>
          <p className="text-[13px] text-brand-dark-text mb-3">
            Set <code>TELEPHONY_PROVIDER</code> (exotel / knowlarity / myoperator / ozonetel).
            Screen-pop, call log, and missed-call → lead land at:
          </p>
          <code className="block text-[12px] bg-brand-bg border border-brand-border rounded px-3 py-2 font-mono break-all">
            {base}/api/webhooks/telephony
          </code>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-brand-charcoal">Public lead intake</h3>
            <Badge color="green">enabled</Badge>
          </div>
          <p className="text-[13px] text-brand-dark-text mb-3">Post form/API leads to:</p>
          <code className="block text-[12px] bg-brand-bg border border-brand-border rounded px-3 py-2 font-mono break-all mb-2">
            POST {base}/api/webhooks/leads
          </code>
          <p className="text-[12px] text-brand-dark-text">
            Facebook Lead Ads: <code>/api/webhooks/facebook-lead-ads</code> · IndiaMART:{" "}
            <code>/api/webhooks/indiamart</code>
          </p>
        </Card>
      </div>
    </>
  );
}
