import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { EventLandingPage } from "@/components/public/event-landing";
import type { EventRow } from "@/lib/database.types";

export const metadata: Metadata = {
  title: "18startup",
};

export default async function BuyerEventPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const sb = supabaseAdmin();
  const { data } = await sb
    .from("events")
    .select("*")
    .eq("slug", slug)
    .maybeSingle<EventRow>();
  if (!data) return notFound();

  if (!data.is_published) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-bg p-6">
        <div className="bg-white rounded-[12px] shadow p-8 max-w-md text-center">
          <h1 className="text-[20px] font-bold text-brand-charcoal mb-2">
            {data.title}
          </h1>
          <p className="text-[14px] text-brand-dark-text">
            Registrations aren&apos;t open for this event right now.
          </p>
        </div>
      </div>
    );
  }

  // Count registrations for capacity display.
  let registeredCount = 0;
  if (data.capacity) {
    let q = sb
      .from("event_registrations")
      .select("id", { count: "exact", head: true })
      .eq("event_id", data.id);
    if (data.amount_paise > 0) q = q.not("paid_at", "is", null);
    const { count } = await q;
    registeredCount = count ?? 0;
  }

  return <EventLandingPage event={data} registeredCount={registeredCount} />;
}
