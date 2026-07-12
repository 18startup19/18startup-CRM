import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { PayPage } from "@/components/public/pay-page";
import type { PaymentPageRow } from "@/lib/database.types";

// Public buyer-facing page. No auth. The URL you paste into Webflow buttons
// points here. The `id` is the payment_pages row UUID.
export default async function BuyerPayPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sb = supabaseAdmin();
  const { data } = await sb
    .from("payment_pages")
    .select("*")
    .eq("id", id)
    .maybeSingle<PaymentPageRow>();
  if (!data) return notFound();

  if (!data.is_active) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-bg p-6">
        <div className="bg-white rounded-[12px] shadow p-8 max-w-md text-center">
          <h1 className="text-[20px] font-bold text-brand-charcoal mb-2">
            {data.title}
          </h1>
          <p className="text-[14px] text-brand-dark-text">
            This payment page isn&apos;t accepting payments right now. Please
            reach out to the team if you need help.
          </p>
        </div>
      </div>
    );
  }

  return (
    <PayPage
      pageId={data.id}
      title={data.title}
      description={data.description}
      imageUrl={data.image_url}
      amountPaise={data.amount_paise}
      currency={data.currency}
    />
  );
}
