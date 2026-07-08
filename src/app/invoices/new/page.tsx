import { PageHeader } from "@/components/page-header";
import { InvoiceForm } from "@/components/invoices/invoice-form";

export default function NewInvoicePage() {
  return (
    <>
      <PageHeader
        title="Create invoice"
        subtitle="Fill in the details; the invoice syncs to the Finance Tracker on save."
      />
      <div className="p-8 max-w-[720px]">
        <InvoiceForm />
      </div>
    </>
  );
}
