"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  FieldError,
  FieldLabel,
  Input,
  Textarea,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createInvoiceAction, type InvoiceResult } from "@/app/actions/invoices";
import { useToast } from "@/components/ui/toast";

const initial: InvoiceResult = {};

function todayIso(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function InvoiceForm() {
  const [state, formAction, isPending] = useActionState(
    createInvoiceAction,
    initial,
  );
  const router = useRouter();
  const { toast } = useToast();

  const [gst, setGst] = useState("");
  const [pan, setPan] = useState("");

  useEffect(() => {
    if (state.ok) {
      toast("Invoice created.");
      router.push("/invoices");
    }
  }, [state.ok, router, toast]);

  return (
    <Card className="p-6">
      <form action={formAction} className="flex flex-col gap-5">
        <Section title="Customer">
          <Row>
            <Field label="Customer name" required>
              <Input name="customer_name" required placeholder="e.g. Rahul Verma" />
            </Field>
            <Field label="Program start date (invoice date)" required>
              <Input
                name="invoice_date"
                type="date"
                required
                defaultValue={todayIso()}
              />
            </Field>
          </Row>
          <Field label="Company name" required>
            <Input
              name="company_name"
              required
              placeholder="e.g. Verma Solutions Pvt Ltd"
            />
          </Field>
          <Field label="Company address" required>
            <Textarea
              name="company_address"
              required
              rows={2}
              placeholder="Street, City, State, PIN"
            />
          </Field>
          <Row>
            <Field label="GST number" required>
              <Input
                name="gst_number"
                required
                placeholder="22ABCDE1234F1Z5"
                value={gst}
                onChange={(e) => setGst(e.target.value.toUpperCase())}
                className="uppercase"
              />
            </Field>
            <Field label="PAN number (optional)">
              <Input
                name="pan_number"
                placeholder="ABCDE1234F"
                value={pan}
                onChange={(e) => setPan(e.target.value.toUpperCase())}
                className="uppercase"
              />
            </Field>
          </Row>
        </Section>

        <Section title="Product">
          <Field label="Product name" required>
            <Input
              name="product_name"
              required
              placeholder="e.g. 18startup Founders Workshop"
            />
          </Field>
          <Field label="Total amount (₹)" required>
            <Input
              name="total_amount"
              type="number"
              step="0.01"
              min={0}
              required
              placeholder="0.00"
            />
          </Field>
        </Section>

        {state.error && (
          <div className="bg-[#FFF4EF] border border-[#FFD5C2] rounded-[10px] px-4 py-3">
            <FieldError>{state.error}</FieldError>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="md" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" size="md" disabled={isPending}>
            {isPending ? "Creating…" : "Create invoice"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-[13px] font-bold uppercase tracking-[0.6px] text-brand-dark-text border-b border-brand-border pb-2">
        {title}
      </h3>
      {children}
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>;
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-[7px]">
      <FieldLabel>
        {label}
        {required && <span className="text-brand-orange"> *</span>}
      </FieldLabel>
      {children}
    </div>
  );
}
