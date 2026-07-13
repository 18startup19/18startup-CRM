"use client";

import { useState } from "react";

interface Props {
  slug: string;
  token: string;
  eventTitle: string;
  imageUrl: string | null;
}

// The page an attendee lands on after scanning the organiser's QR code.
// Two flows:
//   - Registered attendee → enter phone → we match against registrations
//     and mark them attended.
//   - Not registered (walk-in) → also give name + email → we create a
//     registration + lead on the spot, marked attended.
export function AttendeeCheckin({ slug, token, eventTitle, imageUrl }: Props) {
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [needsDetails, setNeedsDetails] = useState(false);
  const [status, setStatus] = useState<
    "idle" | "submitting" | "success" | "already"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [successName, setSuccessName] = useState<string>("");

  async function onSubmit() {
    setError(null);
    if (!phone.trim()) {
      setError("Please enter your phone number.");
      return;
    }
    if (needsDetails && (!name.trim() || !email.trim())) {
      setError("Please fill in your name and email.");
      return;
    }
    setStatus("submitting");
    try {
      const res = await fetch(`/api/e/${slug}/checkin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, phone, name, email }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        if (json.needsDetails) {
          setNeedsDetails(true);
          setError(json.error ?? "Please fill in your name and email.");
        } else {
          setError(json.error ?? "Check-in failed.");
        }
        setStatus("idle");
        return;
      }
      setSuccessName(json.name ?? "");
      setStatus(json.already ? "already" : "success");
    } catch (err) {
      setStatus("idle");
      setError(err instanceof Error ? err.message : "Check-in failed.");
    }
  }

  if (status === "success" || status === "already") {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center p-6">
        <div className="bg-white rounded-[16px] shadow-xl p-8 max-w-md w-full text-center">
          <div
            className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl ${status === "already" ? "bg-amber-100 text-amber-600" : "bg-green-100 text-green-600"}`}
          >
            ✓
          </div>
          <h1 className="text-[22px] font-bold text-brand-charcoal mb-2">
            {status === "already"
              ? `Already checked in, ${successName || "there"}!`
              : `Welcome, ${successName || "there"}!`}
          </h1>
          <p className="text-[14px] text-brand-dark-text">
            You&apos;re marked attended for <strong>{eventTitle}</strong>. Enjoy
            the event.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-bg">
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt={eventTitle}
          className="w-full h-[180px] object-cover"
        />
      ) : (
        <div className="w-full h-[120px] bg-gradient-to-br from-brand-orange to-[#B94D1E]" />
      )}
      <div className="max-w-md mx-auto -mt-10 px-4 pb-16">
        <div className="bg-white rounded-[16px] shadow-xl p-6">
          <div className="text-[11px] font-bold uppercase tracking-[0.6px] text-brand-orange">
            Check-in
          </div>
          <h1 className="text-[22px] font-bold text-brand-charcoal mt-1 break-words">
            {eventTitle}
          </h1>
          <p className="text-[13.5px] text-brand-dark-text mt-2">
            Enter the phone number you registered with. If you didn&apos;t
            pre-register, we&apos;ll ask a couple more details.
          </p>

          <div className="mt-5 flex flex-col gap-4">
            <FormField label="Phone" value={phone} onChange={setPhone} type="tel" placeholder="+91…" autoComplete="tel" />

            {needsDetails && (
              <>
                <FormField label="Full name" value={name} onChange={setName} autoComplete="name" />
                <FormField label="Email" value={email} onChange={setEmail} type="email" autoComplete="email" />
              </>
            )}

            {error && (
              <div className="text-[13px] text-red-600 bg-red-50 border border-red-200 rounded-[8px] px-3 py-2">
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={onSubmit}
              disabled={status === "submitting"}
              className="w-full bg-brand-orange text-white text-[15px] font-bold py-3 rounded-[12px] hover:bg-brand-orange-dark disabled:opacity-60"
            >
              {status === "submitting" ? "Checking you in…" : "Check me in"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FormField({
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
