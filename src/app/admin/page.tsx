import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";

async function counts() {
  const sb = supabaseAdmin();
  const [leads, users, stages, fields] = await Promise.all([
    sb.from("leads").select("id", { count: "exact", head: true }),
    sb.from("users").select("id", { count: "exact", head: true }).eq("is_active", true),
    sb.from("lead_stages").select("id", { count: "exact", head: true }).eq("is_archived", false),
    sb.from("custom_fields").select("id", { count: "exact", head: true }).eq("is_archived", false),
  ]);
  return {
    leads: leads.count ?? 0,
    users: users.count ?? 0,
    stages: stages.count ?? 0,
    fields: fields.count ?? 0,
  };
}

const tiles = [
  { title: "Users", href: "/admin/users", desc: "Create team members, assign roles & permissions." },
  { title: "Lead stages", href: "/admin/stages", desc: "Define the pipeline stages your leads move through." },
  { title: "Custom fields", href: "/admin/fields", desc: "Add fields on the lead record — text, dropdown, date, etc." },
  { title: "Email templates", href: "/admin/templates", desc: "Reusable email bodies with {{variable}} tokens." },
  { title: "WhatsApp templates", href: "/admin/whatsapp-templates", desc: "BSP-approved templates for outbound automation." },
  { title: "Workflows", href: "/admin/workflows", desc: "Trigger emails, WhatsApps, and assignments on events." },
  { title: "Integrations", href: "/admin/integrations", desc: "Configure email, WhatsApp, and telephony providers." },
];

export default async function AdminHome() {
  const c = await counts();
  return (
    <>
      <PageHeader title="Admin console" subtitle="Configure the CRM for your team." />
      <div className="p-8">
        <div className="grid grid-cols-4 gap-4 mb-8">
          <Stat label="Active leads" value={c.leads} />
          <Stat label="Active users" value={c.users} />
          <Stat label="Stages" value={c.stages} />
          <Stat label="Custom fields" value={c.fields} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {tiles.map((t) => (
            <Link key={t.href} href={t.href}>
              <Card className="p-6 hover:border-brand-orange transition-colors">
                <h3 className="text-[16px] font-bold text-brand-charcoal mb-1">{t.title}</h3>
                <p className="text-[13px] text-brand-dark-text">{t.desc}</p>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-5">
      <div className="text-[11px] font-bold uppercase tracking-[1px] text-brand-dark-text">
        {label}
      </div>
      <div className="text-[28px] font-black text-brand-charcoal mt-1">{value}</div>
    </Card>
  );
}
