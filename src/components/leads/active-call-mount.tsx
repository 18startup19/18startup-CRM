import { fetchActiveCall } from "@/app/actions/active-call";
import { ActiveCallCard } from "./active-call-card";

// Server component: renders nothing if no active call. Mounted inside layouts
// (leads + whatsapp + admin) so the card persists across route changes.

export async function ActiveCallMount() {
  const active = await fetchActiveCall();
  if (!active) return null;
  return <ActiveCallCard initial={active} />;
}
