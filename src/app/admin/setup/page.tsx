import Link from "next/link";
import { ArrowRight, Layers, UserCog, Workflow } from "lucide-react";
import { PageHeader } from "@/components/page-header";

// Hub page for the CRM's structural settings — the shape of a lead, the
// stages it moves through, and the automations that fire on it. Each block
// links out to the full sub-module; underlying URLs are unchanged so any
// existing links or bookmarks keep working.

const blocks = [
  {
    href: "/admin/stages",
    icon: Layers,
    title: "Lead stages",
    description:
      "The columns leads flow through on the Kanban. Rename, reorder, add pipelines, or archive stages you no longer use.",
  },
  {
    href: "/admin/fields",
    icon: UserCog,
    title: "Custom fields",
    description:
      "Extra fields you want to capture on every lead (city, source, program, etc.). Appears on the lead details form.",
  },
  {
    href: "/admin/workflows",
    icon: Workflow,
    title: "Workflows",
    description:
      "Automations that fire on lead events — auto-send a WhatsApp on new lead, tag a lead when it hits a stage, etc.",
  },
];

export default function AdminSetupHubPage() {
  return (
    <>
      <PageHeader
        title="Setup"
        subtitle="Shape of a lead, the stages it moves through, and the automations that run on it."
      />
      <div className="p-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-6xl">
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
