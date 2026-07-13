import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { AttendeeCheckin } from "@/components/public/attendee-checkin";
import type { EventRow } from "@/lib/database.types";

export const metadata: Metadata = {
  title: "Check-in · 18startup",
};

export default async function AttendeeCheckinPage({
  params,
}: {
  params: Promise<{ slug: string; token: string }>;
}) {
  const { slug, token } = await params;
  const sb = supabaseAdmin();
  const { data } = await sb
    .from("events")
    .select("id,slug,title,image_url,checkin_token,is_published")
    .eq("slug", slug)
    .maybeSingle<
      Pick<EventRow, "id" | "slug" | "title" | "image_url" | "checkin_token" | "is_published">
    >();
  if (!data) return notFound();

  if (data.checkin_token !== token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-bg p-6">
        <div className="bg-white rounded-[12px] shadow p-8 max-w-md text-center">
          <h1 className="text-[20px] font-bold text-brand-charcoal mb-2">
            Check-in link expired
          </h1>
          <p className="text-[14px] text-brand-dark-text">
            Ask the organiser for the current QR code.
          </p>
        </div>
      </div>
    );
  }

  return (
    <AttendeeCheckin
      slug={data.slug}
      token={data.checkin_token}
      eventTitle={data.title}
      imageUrl={data.image_url}
    />
  );
}
