import { ButtonHTMLAttributes, forwardRef } from "react";
import clsx from "clsx";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
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

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => (
    <button
      ref={ref}
      className={clsx(
        "rounded-[10px] font-bold tracking-[0.2px] transition-all duration-200 cursor-pointer disabled:cursor-not-allowed",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = "Button";
