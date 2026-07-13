"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import clsx from "clsx";
import {
  LayoutGrid,
  Users,
  Layers,
  ListChecks,
  MailIcon,
  MessageSquare,
  Settings,
  LogOut,
  UserCog,
  Import,
  Workflow,
  ChevronLeft,
  ChevronRight,
  IndianRupee,
  HelpCircle,
  FileText,
  Menu,
  X,
  Route,
  BookUser,
  Calendar,
} from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { logoutAction } from "@/app/actions/auth";
import { CallbackReminders } from "@/components/callback-reminders";
import type { Session } from "@/lib/session-types";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  // When set, hides this item unless session.role is included. Absent =
  // visible to everyone (member/manager/admin).
  roles?: Session["role"][];
}

const memberNav: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutGrid },
  { href: "/leads/kanban", label: "Leads", icon: Layers },
  {
    href: "/contacts",
    label: "Contacts",
    icon: BookUser,
    roles: ["admin", "manager"],
  },
  { href: "/whatsapp", label: "WhatsApp", icon: MessageSquare },
  { href: "/leads/callbacks", label: "My Callbacks", icon: ListChecks },
  { href: "/converted-leads", label: "Converted leads", icon: IndianRupee },
  { href: "/invoices", label: "Invoices", icon: FileText },
  { href: "/faq", label: "FAQ templates", icon: HelpCircle },
];

const adminNav: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutGrid },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/setup", label: "Setup", icon: UserCog },
  { href: "/admin/message-templates", label: "Templates", icon: MailIcon },
  { href: "/admin/cohorts", label: "Cohort Onboarding", icon: IndianRupee },
  { href: "/admin/leads-inflow", label: "Leads Inflow", icon: Route },
  { href: "/admin/events", label: "Events", icon: Calendar },
  { href: "/admin/integrations", label: "Integrations", icon: Settings },
];

const COLLAPSE_KEY = "crm_sidebar_collapsed";

export function AppShell({
  session,
  section,
  children,
}: {
  session: Session;
  section: "leads" | "admin";
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const rawNav = section === "admin" ? adminNav : memberNav;
  const nav = rawNav.filter(
    (item) => !item.roles || item.roles.includes(session.role),
  );

  // Desktop collapse persists to localStorage. Mobile drawer is transient —
  // opens over the content, closes on nav or scrim tap.
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => {
    const stored = localStorage.getItem(COLLAPSE_KEY);
    if (stored === "1") setCollapsed(true);
  }, []);
  // Close the drawer whenever the route changes.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  function toggleCollapsed() {
    setCollapsed((v) => {
      const next = !v;
      localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      return next;
    });
  }

  const asideClasses = clsx(
    // Desktop: static column that pushes content right.
    "md:static md:translate-x-0 md:shrink-0",
    "bg-brand-charcoal text-white flex flex-col p-3 sidebar-scroll overflow-y-auto transition-[width,transform] duration-200",
    // Mobile: off-canvas drawer slid in via translate.
    "fixed top-0 bottom-0 left-0 z-50 w-[260px]",
    mobileOpen ? "translate-x-0" : "-translate-x-full",
    // Desktop width still controlled by the collapse toggle.
    collapsed ? "md:w-[68px]" : "md:w-[240px]",
  );

  return (
    <div className="h-screen flex bg-brand-bg overflow-hidden">
      {/* Scrim behind the mobile drawer */}
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
        />
      )}

      <aside className={asideClasses}>
        <div
          className={clsx(
            "flex items-center mb-6",
            collapsed ? "md:justify-center justify-between pl-2" : "justify-between pl-2",
          )}
        >
          {(!collapsed || mobileOpen) && <Logo onDark size="md" />}
          {/* Mobile close button */}
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="md:hidden p-1.5 rounded-[8px] text-white/70 hover:text-white hover:bg-white/10"
            title="Close menu"
          >
            <X size={16} />
          </button>
          {/* Desktop collapse toggle */}
          <button
            type="button"
            onClick={toggleCollapsed}
            className="hidden md:inline-flex p-1.5 rounded-[8px] text-white/70 hover:text-white hover:bg-white/10"
            title={collapsed ? "Expand" : "Collapse"}
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>

        <nav className="flex flex-col gap-1 flex-1">
          {nav.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== "/admin" && pathname.startsWith(item.href));
            const Icon = item.icon;
            const compact = collapsed && !mobileOpen;
            return (
              <Link
                key={item.href}
                href={item.href}
                title={compact ? item.label : undefined}
                className={clsx(
                  "flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[14px] font-semibold transition-colors",
                  compact && "md:justify-center md:px-0",
                  active
                    ? "bg-brand-orange text-white"
                    : "text-white/70 hover:text-white hover:bg-white/5",
                )}
              >
                <Icon size={16} />
                {!compact && item.label}
              </Link>
            );
          })}

          {session.role === "admin" && section === "leads" && (
            <Link
              href="/admin"
              title={collapsed && !mobileOpen ? "Admin console" : undefined}
              className={clsx(
                "mt-4 flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[14px] font-semibold text-white/70 hover:text-white hover:bg-white/5",
                collapsed && !mobileOpen && "md:justify-center md:px-0",
              )}
            >
              <Settings size={16} />
              {(!collapsed || mobileOpen) && "Admin console"}
            </Link>
          )}
          {session.role === "admin" && section === "admin" && (
            <Link
              href="/leads/kanban"
              title={collapsed && !mobileOpen ? "Back to leads" : undefined}
              className={clsx(
                "mt-4 flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[14px] font-semibold text-white/70 hover:text-white hover:bg-white/5",
                collapsed && !mobileOpen && "md:justify-center md:px-0",
              )}
            >
              <LayoutGrid size={16} />
              {(!collapsed || mobileOpen) && "Back to leads"}
            </Link>
          )}
        </nav>

        <div className="mt-6 pt-5 border-t border-white/10">
          {(!collapsed || mobileOpen) && (
            <div className="px-3 mb-3">
              <div className="text-[13px] font-bold text-white truncate">{session.name}</div>
              <div className="text-[11px] text-white/50 truncate">{session.email}</div>
            </div>
          )}
          <form action={logoutAction}>
            <button
              type="submit"
              title={collapsed && !mobileOpen ? "Sign out" : undefined}
              className={clsx(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[13px] font-semibold text-white/70 hover:text-white hover:bg-white/5",
                collapsed && !mobileOpen && "md:justify-center md:px-0",
              )}
            >
              <LogOut size={14} />
              {(!collapsed || mobileOpen) && "Sign out"}
            </button>
          </form>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto overflow-x-hidden h-screen">
        {/* Mobile top bar — hamburger + logo. Only shown on <md. */}
        <div className="md:hidden sticky top-0 z-30 flex items-center gap-3 px-4 py-3 bg-brand-charcoal text-white shadow">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="p-1.5 rounded-[8px] hover:bg-white/10"
            title="Open menu"
          >
            <Menu size={18} />
          </button>
          <Logo onDark size="sm" />
        </div>
        {children}
      </main>
      <CallbackReminders />
    </div>
  );
}
