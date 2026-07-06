"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

// Thin orange progress bar at the very top of every page. Fires whenever the
// pathname or query string changes, and completes shortly after — enough of a
// visual signal that navigation happened.

export function RouteProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    let running = true;
    setVisible(true);
    setWidth(0);
    const step = (t: number) => {
      if (!running) return;
      // Fast climb to 70%, then trickle
      setWidth((w) => {
        if (w < 70) return w + (70 - w) * 0.35;
        if (w < 90) return w + 0.4;
        return w;
      });
      if (t < 800) setTimeout(() => step(t + 50), 50);
    };
    step(0);
    const done = setTimeout(() => {
      setWidth(100);
      setTimeout(() => setVisible(false), 250);
    }, 550);
    return () => {
      running = false;
      clearTimeout(done);
    };
  }, [pathname, searchParams]);

  if (!visible && width === 0) return null;
  return (
    <div className="fixed top-0 left-0 right-0 h-[3px] z-[9999] pointer-events-none">
      <div
        className={
          "h-full bg-brand-orange transition-[width,opacity] duration-200 " +
          (visible ? "opacity-100" : "opacity-0")
        }
        style={{ width: `${width}%` }}
      />
    </div>
  );
}
