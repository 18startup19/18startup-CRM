import Link from "next/link";
import { ArrowRight, IndianRupee, Route } from "lucide-react";
import { PageHeader } from "@/components/page-header";

// Hub page that groups the two ways leads flow into the CRM. Each block
// links out to the full sub-module — the underlying pages (/admin/lead-
// routing and /admin/payment-pages) are unchanged, so any existing links
// or bookmarks keep working.

const blocks = [
  {
    href: "/admin/lead-routing",
    icon: Route,
    title: "Workflow Lead Routing",
    description:
      "Fallback stage + Webflow forms + field mapping. Controls where leads from Webflow forms end up in the CRM.",
  },
  {
    href: "/admin/payment-pages",
    icon: IndianRupee,
    title: "Razorpay Payment Pages",
    description:
      "Create hosted payment pages and paste their URL into your website buttons. Every payment auto-creates a lead in the CRM.",
  },
];

export default function LeadsInflowHubPage() {
  return (
    <>
      <PageHeader
        title="Leads Inflow"
        subtitle="Every way a new lead can arrive in the CRM."
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
