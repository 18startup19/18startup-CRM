"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { X, CheckCircle2, AlertCircle, Info } from "lucide-react";

type ToastKind = "success" | "error" | "info";
interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
}

interface ToastContextValue {
  toast: (message: string, kind?: ToastKind) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) return { toast: () => {} };
  return ctx;
}

interface InitialToast {
  message: string;
  kind?: ToastKind;
}

export function ToastProvider({
  children,
  initial,
}: {
  children: React.ReactNode;
  initial?: InitialToast[];
}) {
  const [items, setItems] = useState<Toast[]>([]);

  const toast = useCallback((message: string, kind: ToastKind = "success") => {
    const id = Math.random().toString(36).slice(2);
    setItems((prev) => [...prev, { id, kind, message }]);
    setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 2800);
  }, []);

  useEffect(() => {
    if (!initial) return;
    for (const t of initial) toast(t.message, t.kind);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 max-w-[360px]">
        {items.map((t) => {
          const Icon =
            t.kind === "error" ? AlertCircle : t.kind === "info" ? Info : CheckCircle2;
          return (
            <div
              key={t.id}
              className={
                "flex items-start gap-3 bg-white border rounded-[12px] shadow-lg px-4 py-3 text-[13px] font-semibold animate-[slide-up_180ms_ease-out] " +
                (t.kind === "error"
                  ? "border-red-200 text-red-700"
                  : t.kind === "info"
                    ? "border-brand-border text-brand-charcoal"
                    : "border-[#B7EBCB] text-[#1a8f4c]")
              }
            >
              <Icon size={16} className="mt-0.5 shrink-0" />
              <span className="flex-1">{t.message}</span>
              <button
                onClick={() => setItems((prev) => prev.filter((x) => x.id !== t.id))}
                className="text-brand-dark-text hover:text-brand-charcoal"
                aria-label="Dismiss"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
