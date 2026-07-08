"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { deleteInvoiceAction } from "@/app/actions/invoices";
import { useToast } from "@/components/ui/toast";

export function InvoiceDeleteButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (
          !window.confirm(
            "Delete this invoice? This removes it from the Finance Tracker too.",
          )
        )
          return;
        start(async () => {
          const res = await deleteInvoiceAction(id);
          if (res.error) {
            toast(res.error, "error");
            return;
          }
          toast("Invoice deleted.");
          router.push("/invoices");
        });
      }}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-[13px] font-bold border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
      title="Delete invoice (admin only)"
    >
      <Trash2 size={13} />
      {pending ? "Deleting…" : "Delete"}
    </button>
  );
}
