export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="border-b border-brand-border bg-white">
      <div className="px-8 py-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-black text-brand-charcoal leading-tight">{title}</h1>
          {subtitle && (
            <p className="text-[13px] text-brand-dark-text mt-1">{subtitle}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-3">{actions}</div>}
      </div>
    </div>
  );
}
