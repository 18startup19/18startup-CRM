import Link from "next/link";
import { ArrowRight, MailIcon, MessageSquare } from "lucide-react";
import { PageHeader } from "@/components/page-header";

// Hub page for the two kinds of message templates the CRM sends: email
// (SendGrid) and WhatsApp (Twilio). Each block links to the full sub-
// module; underlying URLs are unchanged so any existing links keep working.

const blocks = [
  {
    href: "/admin/templates",
    icon: MailIcon,
    title: "Email templates",
    description:
      "Reusable email bodies with {{name}}, {{phone}}, {{custom.key}} tokens. Used by the Send Email button on lead details.",
  },
  {
    href: "/admin/whatsapp-templates",
    icon: MessageSquare,
    title: "WhatsApp templates",
    description:
      "Approved Twilio Content templates for outbound WhatsApp. Sync from Twilio, pick one when sending from a lead.",
  },
];

export default function TemplatesHubPage() {
  return (
    <>
      <PageHeader
        title="Templates"
        subtitle="Reusable message templates for outbound email and WhatsApp."
      />
      <div className="p-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl">
          {blocks.map((b) => {
            const Icon = b.icon;
            return (
              <Link
                key={b.href}
                href={b.href}
                className="group bg-white border border-brand-border rounded-2xl p-6 hover:border-brand-orange hover:shadow-md transition-all flex flex-col gap-3"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-brand-orange/10 text-brand-orange flex items-center justify-center">
                    <Icon size={18} />
                  </div>
                  <h2 className="text-[16px] font-bold text-brand-charcoal">
                    {b.title}
                  </h2>
                </div>
                <p className="text-[13px] text-brand-dark-text leading-relaxed">
                  {b.description}
                </p>
                <div className="mt-auto pt-2 flex items-center gap-1 text-[12.5px] font-bold text-brand-orange group-hover:text-brand-orange-dark">
                  Open
                  <ArrowRight
                    size={12}
                    className="transition-transform group-hover:translate-x-0.5"
                  />
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
