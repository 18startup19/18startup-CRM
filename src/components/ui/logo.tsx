import clsx from "clsx";

// Text logo — swap for image once /public/brand assets are dropped in.
export function Logo({
  onDark = false,
  className,
  size = "md",
}: {
  onDark?: boolean;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const sizeClass = {
    sm: "text-[16px]",
    md: "text-[20px]",
    lg: "text-[26px]",
  }[size];

  const mark = (
    <span className={clsx("font-black tracking-tight", sizeClass, className)}>
      <span className="text-brand-orange">18</span>
      <span className={onDark ? "text-white" : "text-brand-charcoal"}>startup</span>
      <span className="text-brand-orange">.</span>
    </span>
  );

  if (!onDark) return mark;

  return (
    <div className="inline-flex items-center bg-brand-charcoal rounded-xl px-3 py-2 w-fit">
      {mark}
    </div>
  );
}
