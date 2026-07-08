"use client";

import { useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { resyncInvoiceAction } from "@/app/actions/invoices";
import { useToast } from "@/components/ui/toast";

export function InvoiceResyncButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await resyncInvoiceAction(id);
          if (res.error) toast(`Sync failed: ${res.error}`, "error");
          else toast("Synced to Finance Tracker.");
          router.refresh();
        })
      }
      title="Retry Finance Tracker sync"
      className="inline-flex items-center gap-1 text-[11.5px] font-bold text-brand-orange hover:text-brand-orange-dark disabled:opacity-50"
    >
      <RefreshCw size={11} className={pending ? "animate-spin" : ""} />
      {pending ? "Retrying…" : "Retry"}
    </button>
  );
}
