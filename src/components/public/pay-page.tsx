"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  pageId: string;
  title: string;
  programName: string | null;
  description: string | null;
  imageUrl: string | null;
  amountPaise: number;
  currency: string;
  thankYouUrl: string | null;
}

interface RazorpayCheckoutOptions {
  key: string;
  amount: number;
  currency: string;
  order_id: string;
  name: string;
  description?: string;
  image?: string;
  prefill?: { name?: string; email?: string; contact?: string };
  notes?: Record<string, string>;
  theme?: { color?: string };
  handler?: (response: unknown) => void;
  modal?: { ondismiss?: () => void };
}

interface RazorpayInstance {
  open: () => void;
}

interface RazorpayGlobal {
  new (options: RazorpayCheckoutOptions): RazorpayInstance;
}

declare global {
  interface Window {
    Razorpay?: RazorpayGlobal;
  }
}

export function PayPage({
  pageId,
  title,
  programName,
  description,
  imageUrl,
  amountPaise,
  currency,
  thankYouUrl,
}: Props) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");
  const [status, setStatus] = useState<
    "idle" | "creating" | "opening" | "success" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const scriptLoaded = useRef(false);

  // Load Razorpay Checkout.js once. It attaches window.Razorpay.
  useEffect(() => {
    if (scriptLoaded.current) return;
    scriptLoaded.current = true;
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    document.body.appendChild(s);
  }, []);

  const rupees = (amountPaise / 100).toFixed(2);

  async function onPay() {
    setError(null);
    if (!name.trim() || !phone.trim() || !email.trim() || !city.trim()) {
      setError("Please fill in all fields.");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError("Please enter a valid email.");
      return;
    }

    setStatus("creating");
    let orderData: {
      orderId: string;
      keyId: string;
      amountPaise: number;
      currency: string;
    };
    try {
      const res = await fetch(`/api/pay/${pageId}/create-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, email, city }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? `Server error (${res.status})`);
      }
      orderData = json.order;
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Failed to start payment.");
      return;
    }

    // Wait a beat for Razorpay's script to attach itself if the page just
    // loaded — otherwise window.Razorpay may not exist yet.
    setStatus("opening");
    let tries = 0;
    while (!window.Razorpay && tries < 40) {
      await new Promise((r) => setTimeout(r, 100));
      tries++;
    }
    if (!window.Razorpay) {
      setStatus("error");
      setError(
        "Payment SDK failed to load. Check your internet connection and refresh.",
      );
      return;
    }

    const rzp = new window.Razorpay({
      key: orderData.keyId,
      amount: orderData.amountPaise,
      currency: orderData.currency,
      order_id: orderData.orderId,
      name: title,
      description: description ?? undefined,
      image: imageUrl ?? undefined,
      prefill: { name, email, contact: phone },
      theme: { color: "#F0783C" },
      handler: () => {
        setStatus("success");
      },
      modal: {
        ondismiss: () => {
          if (status !== "success") setStatus("idle");
        },
      },
    });
    rzp.open();
  }

  if (status === "success") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-bg p-6">
        <div className="bg-white rounded-[12px] shadow p-8 max-w-md text-center">
          <div className="w-16 h-16 rounded-full bg-green-100 text-green-600 flex items-center justify-center mx-auto mb-4 text-3xl">
            ✓
          </div>
          <h1 className="text-[20px] font-bold text-brand-charcoal mb-2">
            Payment successful
          </h1>
          <p className="text-[14px] text-brand-dark-text mb-4">
            Thank you, {name}. We&apos;ve received your payment for{" "}
            <strong>{title}</strong>. You&apos;ll hear from us shortly with next
            steps.
          </p>
          {thankYouUrl ? (
            <a
              href={thankYouUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block w-full bg-brand-orange text-white text-[15px] font-bold py-3 rounded-[10px] hover:bg-brand-orange-dark transition-colors mt-2"
            >
              Continue →
            </a>
          ) : (
            <p className="text-[12px] text-brand-dark-text">
              You can close this window.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-bg py-8 px-4">
      <div className="max-w-lg mx-auto bg-white rounded-[12px] shadow overflow-hidden">
        {imageUrl && (
          <img
            src={imageUrl}
            alt={title}
            className="w-full h-48 object-cover"
          />
        )}
        <div className="p-6">
          {programName && (
            <div className="inline-block text-[11px] font-bold uppercase tracking-[0.5px] text-brand-orange bg-brand-orange/10 rounded-full px-2.5 py-1 mb-2">
              {programName}
            </div>
          )}
          <h1 className="text-[22px] font-bold text-brand-charcoal">{title}</h1>
          {description && (
            <p className="text-[14px] text-brand-dark-text mt-2 whitespace-pre-wrap">
              {description}
            </p>
          )}
          <div className="mt-4 pt-4 border-t border-brand-border flex items-baseline gap-1">
            <span className="text-[11px] font-bold uppercase tracking-[0.5px] text-brand-dark-text">
              Amount
            </span>
            <span className="ml-auto text-[24px] font-bold text-brand-charcoal">
              ₹{rupees}
            </span>
          </div>

          <div className="mt-6 flex flex-col gap-4">
            <Field
              id="name"
              label="Full name"
              value={name}
              onChange={setName}
              placeholder="Your full name"
              autoComplete="name"
            />
            <Field
              id="phone"
              label="Phone"
              value={phone}
              onChange={setPhone}
              placeholder="+91…"
              type="tel"
              autoComplete="tel"
            />
            <Field
              id="email"
              label="Email"
              value={email}
              onChange={setEmail}
              placeholder="you@example.com"
              type="email"
              autoComplete="email"
            />
            <Field
              id="city"
              label="City"
              value={city}
              onChange={setCity}
              placeholder="Bengaluru"
              autoComplete="address-level2"
            />
          </div>

          {error && (
            <div className="mt-4 text-[13px] text-red-600 bg-red-50 border border-red-200 rounded-[8px] px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={onPay}
            disabled={status === "creating" || status === "opening"}
            className="w-full mt-6 bg-brand-orange text-white text-[15px] font-bold py-3 rounded-[10px] hover:bg-brand-orange-dark disabled:opacity-60 transition-colors"
          >
            {status === "creating"
              ? "Starting…"
              : status === "opening"
                ? "Opening payment…"
                : `Pay ₹${rupees}`}
          </button>
          <p className="text-[11px] text-brand-dark-text text-center mt-3">
            Secure payment via Razorpay · {currency}
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <div className="flex flex-col gap-[6px]">
      <label
        htmlFor={id}
        className="text-[11px] font-bold uppercase tracking-[0.5px] text-brand-dark-text"
      >
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="w-full px-3 py-2.5 rounded-[10px] border-[1.5px] border-brand-border bg-brand-bg text-brand-charcoal text-[14px] outline-none focus:bg-white focus:border-brand-orange transition-colors"
      />
    </div>
  );
}
