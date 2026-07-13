"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronDown, MapPin, Users } from "lucide-react";
import type { EventExtraField, EventRow } from "@/lib/database.types";
import "@/lib/razorpay-checkout-types";

interface Props {
  event: EventRow;
  registeredCount: number;
}

export function EventLandingPage({ event, registeredCount }: Props) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<
    "idle" | "submitting" | "paying" | "success" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const scriptLoaded = useRef(false);

  useEffect(() => {
    if (scriptLoaded.current) return;
    scriptLoaded.current = true;
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    document.body.appendChild(s);
  }, []);

  const isFree = event.amount_paise === 0;
  const rupees = (event.amount_paise / 100).toFixed(2);
  const soldOut = event.capacity != null && registeredCount >= event.capacity;

  const dateLabel = useMemo(() => {
    const start = new Date(event.starts_at);
    const startStr = start.toLocaleString("en-IN", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    if (!event.ends_at) return startStr;
    const end = new Date(event.ends_at);
    const sameDay = start.toDateString() === end.toDateString();
    const endStr = end.toLocaleString("en-IN", {
      ...(sameDay ? {} : { day: "2-digit", month: "long" }),
      hour: "2-digit",
      minute: "2-digit",
    });
    return `${startStr} — ${endStr}`;
  }, [event.starts_at, event.ends_at]);

  async function onRegister() {
    setError(null);
    if (!name.trim() || !phone.trim() || !email.trim()) {
      setError("Name, phone and email are required.");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError("Please enter a valid email.");
      return;
    }
    // Check required extra fields
    for (const f of event.extra_fields) {
      if (f.required && !(answers[f.key] ?? "").trim()) {
        setError(`${f.label} is required.`);
        return;
      }
    }

    setStatus("submitting");
    let data: {
      free?: boolean;
      registrationId?: string;
      order?: {
        orderId: string;
        keyId: string;
        amountPaise: number;
        currency: string;
      };
    };
    try {
      const res = await fetch(`/api/e/${event.slug}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, email, answers }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? `Server error (${res.status})`);
      }
      data = json;
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Registration failed.");
      return;
    }

    if (data.free) {
      setStatus("success");
      return;
    }

    setStatus("paying");
    let tries = 0;
    while (!window.Razorpay && tries < 40) {
      await new Promise((r) => setTimeout(r, 100));
      tries++;
    }
    if (!window.Razorpay || !data.order) {
      setStatus("error");
      setError("Payment SDK failed to load. Please refresh and try again.");
      return;
    }
    const rzp = new window.Razorpay({
      key: data.order.keyId,
      amount: data.order.amountPaise,
      currency: data.order.currency,
      order_id: data.order.orderId,
      name: event.title,
      description: event.description ?? undefined,
      image: event.image_url ?? undefined,
      prefill: { name, email, contact: phone },
      theme: { color: "#F0783C" },
      handler: () => setStatus("success"),
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
      <div className="min-h-screen bg-brand-bg flex items-center justify-center p-6">
        <div className="bg-white rounded-[16px] shadow-xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-full bg-green-100 text-green-600 flex items-center justify-center mx-auto mb-4 text-3xl">
            ✓
          </div>
          <h1 className="text-[22px] font-bold text-brand-charcoal mb-2">
            You&apos;re in, {name.split(" ")[0]}!
          </h1>
          <p className="text-[14px] text-brand-dark-text mb-6">
            You&apos;re registered for <strong>{event.title}</strong>. See you on{" "}
            <strong>{dateLabel}</strong>
            {event.location_text && (
              <>
                {" "}
                at <strong>{event.location_text}</strong>
              </>
            )}
            .
          </p>
          <div className="bg-brand-bg rounded-[10px] p-4 text-left text-[13px] text-brand-dark-text">
            <div className="font-bold text-brand-charcoal mb-1">
              How check-in works
            </div>
            An organiser will walk around with a QR code at the venue. Scan it,
            enter this same phone number ({phone}), and you&apos;re marked
            attended.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-bg">
      {/* Hero */}
      {event.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={event.image_url}
          alt={event.title}
          className="w-full h-[280px] md:h-[380px] object-cover"
        />
      ) : (
        <div className="w-full h-[220px] bg-gradient-to-br from-brand-orange to-[#B94D1E]" />
      )}

      <div className="max-w-3xl mx-auto px-4 pt-8 md:pt-10 pb-16">
        {/* Title sits between the hero image and the info card — its own
            headline moment, not competing with the photo behind or the
            content below. */}
        <h1 className="text-[30px] md:text-[42px] font-bold text-brand-charcoal leading-[1.1] tracking-tight break-words mb-6 md:mb-8">
          {event.title}
        </h1>

        <div className="bg-white rounded-[16px] shadow-xl p-6 md:p-10">
          {/* Info block — vertical list of When / Where / Seats. Icons are
              muted-gray (not brand-orange) so the orange Register button is
              the only orange element on the page and reads as the primary
              action. */}
          <dl className="flex flex-col gap-5">
            <InfoRow icon={CalendarDays} label="When">
              <div className="break-words">{dateLabel}</div>
              <div className="text-[12.5px] text-brand-dark-text mt-0.5">
                {event.timezone.replace("_", " ")}
              </div>
            </InfoRow>
            {event.location_text && (
              <InfoRow icon={MapPin} label="Where">
                <div className="break-words">{event.location_text}</div>
                {event.location_map_url && (
                  <a
                    href={event.location_map_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block mt-1 text-[12.5px] font-bold text-brand-orange hover:text-brand-orange-dark"
                  >
                    View on map →
                  </a>
                )}
              </InfoRow>
            )}
            {event.capacity != null && (
              <InfoRow icon={Users} label="Seats">
                {soldOut ? (
                  <span className="text-red-600 font-bold">Sold out</span>
                ) : (
                  <>
                    <strong>{event.capacity - registeredCount}</strong>{" "}
                    <span className="text-brand-dark-text font-normal">
                      of {event.capacity} available
                    </span>
                  </>
                )}
              </InfoRow>
            )}
          </dl>

          {event.description && (
            <>
              <div className="mt-8 border-t border-brand-border" />
              <p className="text-[15px] text-brand-charcoal mt-6 whitespace-pre-wrap break-words leading-[1.7]">
                {event.description}
              </p>
            </>
          )}
        </div>

        {/* Registration form */}
        <div className="bg-white rounded-[16px] shadow p-6 md:p-8 mt-4">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h2 className="text-[18px] font-bold text-brand-charcoal">
              {isFree ? "Register free" : `Register — ₹${rupees}`}
            </h2>
            {!isFree && (
              <div className="text-[12px] text-brand-dark-text">
                Secured by Razorpay
              </div>
            )}
          </div>

          {soldOut ? (
            <div className="bg-red-50 border border-red-200 rounded-[10px] px-4 py-3 text-[14px] text-red-700">
              This event is fully booked. Please check back for the next one.
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <Input label="Full name" value={name} onChange={setName} placeholder="Your full name" autoComplete="name" />
              <Input label="Phone" value={phone} onChange={setPhone} type="tel" placeholder="+91…" autoComplete="tel" />
              <Input label="Email" value={email} onChange={setEmail} type="email" placeholder="you@example.com" autoComplete="email" />

              {event.extra_fields.map((f) => (
                <ExtraField
                  key={f.key}
                  field={f}
                  value={answers[f.key] ?? ""}
                  onChange={(v) =>
                    setAnswers((prev) => ({ ...prev, [f.key]: v }))
                  }
                />
              ))}

              {error && (
                <div className="text-[13px] text-red-600 bg-red-50 border border-red-200 rounded-[8px] px-3 py-2">
                  {error}
                </div>
              )}

              <button
                type="button"
                onClick={onRegister}
                disabled={status === "submitting" || status === "paying"}
                className="w-full bg-brand-orange text-white text-[15px] font-bold py-3 rounded-[12px] hover:bg-brand-orange-dark disabled:opacity-60 transition-colors"
              >
                {status === "submitting"
                  ? "Registering…"
                  : status === "paying"
                    ? "Opening payment…"
                    : isFree
                      ? "Register"
                      : `Pay ₹${rupees} & register`}
              </button>
            </div>
          )}
        </div>

        {/* Guidelines + T&C accordions */}
        {event.guidelines && (
          <Accordion title="Guidelines" body={event.guidelines} />
        )}
        {event.terms_and_conditions && (
          <Accordion title="Terms & conditions" body={event.terms_and_conditions} />
        )}
      </div>
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-4">
      <div className="w-10 h-10 rounded-full bg-brand-bg text-brand-dark-text flex items-center justify-center shrink-0">
        <Icon size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <dt className="text-[10.5px] font-bold uppercase tracking-[0.8px] text-brand-dark-text">
          {label}
        </dt>
        <dd className="text-[15px] font-bold text-brand-charcoal mt-0.5 leading-snug">
          {children}
        </dd>
      </div>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <div className="flex flex-col gap-[6px]">
      <label className="text-[11px] font-bold uppercase tracking-[0.5px] text-brand-dark-text">
        {label}
      </label>
      <input
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

function ExtraField({
  field,
  value,
  onChange,
}: {
  field: EventExtraField;
  value: string;
  onChange: (v: string) => void;
}) {
  const label = `${field.label}${field.required ? " *" : ""}`;
  if (field.type === "longtext") {
    return (
      <div className="flex flex-col gap-[6px]">
        <label className="text-[11px] font-bold uppercase tracking-[0.5px] text-brand-dark-text">
          {label}
        </label>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className="w-full px-3 py-2.5 rounded-[10px] border-[1.5px] border-brand-border bg-brand-bg text-brand-charcoal text-[14px] outline-none focus:bg-white focus:border-brand-orange transition-colors"
        />
      </div>
    );
  }
  if (field.type === "dropdown") {
    return (
      <div className="flex flex-col gap-[6px]">
        <label className="text-[11px] font-bold uppercase tracking-[0.5px] text-brand-dark-text">
          {label}
        </label>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2.5 rounded-[10px] border-[1.5px] border-brand-border bg-brand-bg text-brand-charcoal text-[14px] outline-none focus:bg-white focus:border-brand-orange"
        >
          <option value="">— Select —</option>
          {(field.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>
    );
  }
  return <Input label={label} value={value} onChange={onChange} />;
}

function Accordion({ title, body }: { title: string; body: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white rounded-[12px] shadow mt-4 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 text-left"
      >
        <span className="text-[15px] font-bold text-brand-charcoal">{title}</span>
        <ChevronDown
          size={16}
          className={`text-brand-dark-text transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="px-5 pb-5 text-[13.5px] text-brand-dark-text whitespace-pre-wrap break-words leading-relaxed">
          {body}
        </div>
      )}
    </div>
  );
}
