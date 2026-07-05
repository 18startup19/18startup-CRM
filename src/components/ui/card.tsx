import {
  HTMLAttributes,
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
  forwardRef,
} from "react";
import clsx from "clsx";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx("bg-white border border-brand-border rounded-2xl", className)}
      {...props}
    />
  );
}

const inputClass =
  "w-full px-[18px] py-[14px] rounded-[10px] border-[1.5px] bg-brand-bg text-brand-charcoal text-base outline-none transition-colors duration-200 focus:bg-white focus:border-brand-orange";

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { error?: boolean }
>(({ className, error, ...props }, ref) => (
  <input
    ref={ref}
    className={clsx(inputClass, error ? "border-red-500" : "border-brand-border", className)}
    {...props}
  />
));
Input.displayName = "Input";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: boolean }
>(({ className, error, ...props }, ref) => (
  <textarea
    ref={ref}
    className={clsx(inputClass, "min-h-[100px]", error ? "border-red-500" : "border-brand-border", className)}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & { error?: boolean }
>(({ className, error, children, ...props }, ref) => (
  <select
    ref={ref}
    className={clsx(inputClass, "appearance-none pr-10", error ? "border-red-500" : "border-brand-border", className)}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = "Select";

export function FieldLabel({
  children,
  htmlFor,
}: {
  children: React.ReactNode;
  htmlFor?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="text-[12px] font-bold uppercase tracking-[0.8px] text-brand-dark-text"
    >
      {children}
    </label>
  );
}

export function FieldError({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return <span className="text-[12px] font-semibold text-red-500">{children}</span>;
}

export function Badge({
  children,
  color = "gray",
  className,
}: {
  children: React.ReactNode;
  color?: "gray" | "orange" | "green" | "red" | "blue" | "purple" | "amber" | "slate";
  className?: string;
}) {
  const map: Record<string, string> = {
    gray: "bg-[#EFEFEF] text-brand-dark-text",
    orange: "bg-[#FFF4EF] text-brand-orange border border-[#FFD5C2]",
    green: "bg-[#E7F8EE] text-[#1a8f4c]",
    red: "bg-[#FEECEC] text-red-600",
    blue: "bg-[#EAF2FC] text-[#3673b8]",
    purple: "bg-[#EFEBFF] text-[#5b46c9]",
    amber: "bg-[#FFF6E3] text-[#a3730d]",
    slate: "bg-[#EEF1F5] text-[#5c6b7f]",
  };
  return (
    <span
      className={clsx(
        "inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-[0.4px]",
        map[color],
        className,
      )}
    >
      {children}
    </span>
  );
}
