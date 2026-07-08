// Full-height centered spinner shown as the Next.js loading.tsx fallback
// during route transitions. Slots into whatever container the layout gives
// it, so it renders inside AppShell — the sidebar stays visible.

export function LoadingScreen({ message = "Loading…" }: { message?: string }) {
  return (
    <div className="flex-1 h-full min-h-[60vh] flex flex-col items-center justify-center bg-brand-bg">
      <div
        role="status"
        aria-label="Loading"
        className="w-14 h-14 rounded-full border-[3px] border-brand-border border-t-brand-orange animate-spin"
      />
      <div className="mt-4 text-[15px] font-semibold text-brand-dark-text">
        {message}
      </div>
    </div>
  );
}
