import { notFound } from "next/navigation";
import QRCode from "qrcode";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/rbac-server";
import { EventCheckinView } from "@/components/admin/event-checkin-view";
import type { EventRow } from "@/lib/database.types";

// Organizer's live check-in page. Big QR on the left, live list of who's
// registered + who's checked in so far on the right. Meant to be open on
// a laptop/tablet at the venue.
export default async function EventCheckinPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const sb = supabaseAdmin();

  const [{ data: eventData }, { data: regsData }] = await Promise.all([
    sb.from("events").select("*").eq("id", id).maybeSingle<EventRow>(),
    sb
      .from("event_registrations")
      .select("id,attended_at,registered_at,checkin_source,leads!inner(name,phone,email)")
      .eq("event_id", id)
      .order("registered_at", { ascending: true }),
  ]);
  if (!eventData) return notFound();

  const payDomain = process.env.NEXT_PUBLIC_PAY_DOMAIN?.trim();
  const originGuess = payDomain
    ? `https://${payDomain}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";
  const checkinUrl = `${originGuess}/e/${eventData.slug}/checkin/${eventData.checkin_token}`;
  // Server-rendered SVG data URL — no client JS needed to display the QR.
  const qrDataUrl = await QRCode.toDataURL(checkinUrl, {
    width: 320,
    margin: 2,
    color: { dark: "#111827", light: "#ffffff" },
  });

  type RegRow = {
    id: string;
    attended_at: string | null;
    registered_at: string;
    checkin_source: string | null;
    leads: { name: string; phone: string | null; email: string | null };
  };
  const regs = (regsData ?? []) as unknown as RegRow[];

  return (
    <>
      <PageHeader
        title={`Check-in · ${eventData.internal_label}`}
        subtitle="Show the QR to attendees. They scan, enter their phone, and get marked attended."
        actions={
          <Link
            href="/admin/events"
            className="text-[12px] font-bold text-brand-dark-text hover:text-brand-orange inline-flex items-center gap-1"
          >
            <ArrowLeft size={12} /> Back to events
          </Link>
        }
      />
      <div className="p-8">
        <EventCheckinView
          eventId={eventData.id}
          eventTitle={eventData.title}
          checkinUrl={checkinUrl}
          qrDataUrl={qrDataUrl}
          registrations={regs}
        />
      </div>
    </>
  );
}
