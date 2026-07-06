"use client";

import { ButtonHTMLAttributes, forwardRef } from "react";
import { useFormStatus } from "react-dom";
import clsx from "clsx";
import { Loader2 } from "lucide-react";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary: "bg-brand-orange text-white hover:bg-brand-orange-dark disabled:bg-gray-300",
  secondary: "bg-[#EFEFEF] text-brand-dark-text hover:bg-[#e0e0e0] disabled:opacity-50",
  outline:
    "bg-transparent border-[1.5px] border-brand-border text-brand-dark-text hover:border-brand-orange hover:text-brand-orange disabled:opacity-50",
  ghost: "bg-transparent text-brand-dark-text hover:bg-[#F7F7F7]",
  danger: "bg-red-500 text-white hover:bg-red-600 disabled:opacity-50",
};

const sizeClasses: Record<Size, string> = {
  sm: "px-4 py-2 text-sm",
  md: "px-6 py-3 text-[15px]",
  lg: "px-8 py-4 text-base",
};

// When a Button is used inside a <form action={...}>, useFormStatus tells us
// if the action is pending — automatically wiring the loading spinner without
// callers needing to pass a `loading` prop. Buttons outside a form must pass
// `loading` explicitly.
function FormAwareLoading(): boolean {
  try {
    const status = useFormStatus();
    return status.pending;
  } catch {
    return false;
  }
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant = "primary", size = "md", loading, disabled, children, type, ...props },
    ref,
  ) => {
    const formPending = FormAwareLoading();
    const isPending = loading ?? (type === "submit" ? formPending : false);
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || isPending}
        aria-busy={isPending || undefined}
        className={clsx(
          "relative rounded-[10px] font-bold tracking-[0.2px] transition-all duration-150 cursor-pointer",
          "active:scale-[0.97] disabled:cursor-not-allowed disabled:active:scale-100",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/50",
          variantClasses[variant],
          sizeClasses[size],
          isPending && "cursor-wait",
          className,
        )}
        {...props}
      >
        <span
          className={clsx(
            "inline-flex items-center justify-center gap-1.5 transition-opacity",
            isPending && "opacity-0",
          )}
        >
          {children}
        </span>
        {isPending && (
          <span className="absolute inset-0 flex items-center justify-center">
            <Loader2 size={16} className="animate-spin" />
          </span>
        )}
      </button>
    );
  },
);
Button.displayName = "Button";
