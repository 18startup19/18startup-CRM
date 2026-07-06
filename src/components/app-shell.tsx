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
} from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { logoutAction } from "@/app/actions/auth";
import type { Session } from "@/lib/session-types";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

const memberNav: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutGrid },
  { href: "/leads/kanban", label: "Kanban", icon: Layers },
  { href: "/whatsapp", label: "WhatsApp", icon: MessageSquare },
  { href: "/leads/callbacks", label: "My Callbacks", icon: ListChecks },
  { href: "/converted-leads", label: "Converted leads", icon: IndianRupee },
  { href: "/faq", label: "FAQ templates", icon: HelpCircle },
];

const adminNav: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutGrid },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/stages", label: "Lead stages", icon: Layers },
  { href: "/admin/fields", label: "Custom fields", icon: UserCog },
  { href: "/admin/templates", label: "Templates", icon: MailIcon },
  { href: "/admin/whatsapp-templates", label: "WhatsApp templates", icon: MessageSquare },
  { href: "/admin/workflows", label: "Workflows", icon: Workflow },
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
  const nav = section === "admin" ? adminNav : memberNav;

  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    const stored = localStorage.getItem(COLLAPSE_KEY);
    if (stored === "1") setCollapsed(true);
  }, []);

  function toggleCollapsed() {
    setCollapsed((v) => {
      const next = !v;
      localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      return next;
    });
  }

  return (
    <div className="min-h-screen flex bg-brand-bg">
      <aside
        className={clsx(
          "shrink-0 bg-brand-charcoal text-white flex flex-col p-3 sidebar-scroll overflow-y-auto transition-[width] duration-200",
          collapsed ? "w-[68px]" : "w-[240px]",
        )}
      >
        <div
          className={clsx(
            "flex items-center mb-6",
            collapsed ? "justify-center" : "justify-between pl-2",
          )}
        >
          {!collapsed && <Logo onDark size="md" />}
          <button
            type="button"
            onClick={toggleCollapsed}
            className="p-1.5 rounded-[8px] text-white/70 hover:text-white hover:bg-white/10"
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
            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={clsx(
                  "flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[14px] font-semibold transition-colors",
                  collapsed && "justify-center px-0",
                  active
                    ? "bg-brand-orange text-white"
                    : "text-white/70 hover:text-white hover:bg-white/5",
                )}
              >
                <Icon size={16} />
                {!collapsed && item.label}
              </Link>
            );
          })}

          {session.role === "admin" && section === "leads" && (
            <Link
              href="/admin"
              title={collapsed ? "Admin console" : undefined}
              className={clsx(
                "mt-4 flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[14px] font-semibold text-white/70 hover:text-white hover:bg-white/5",
                collapsed && "justify-center px-0",
              )}
            >
              <Settings size={16} />
              {!collapsed && "Admin console"}
            </Link>
          )}
          {session.role === "admin" && section === "admin" && (
            <Link
              href="/leads/kanban"
              title={collapsed ? "Back to leads" : undefined}
              className={clsx(
                "mt-4 flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[14px] font-semibold text-white/70 hover:text-white hover:bg-white/5",
                collapsed && "justify-center px-0",
              )}
            >
              <LayoutGrid size={16} />
              {!collapsed && "Back to leads"}
            </Link>
          )}
        </nav>

        <div className="mt-6 pt-5 border-t border-white/10">
          {!collapsed && (
            <div className="px-3 mb-3">
              <div className="text-[13px] font-bold text-white truncate">{session.name}</div>
              <div className="text-[11px] text-white/50 truncate">{session.email}</div>
            </div>
          )}
          <form action={logoutAction}>
            <button
              type="submit"
              title={collapsed ? "Sign out" : undefined}
              className={clsx(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[13px] font-semibold text-white/70 hover:text-white hover:bg-white/5",
                collapsed && "justify-center px-0",
              )}
            >
              <LogOut size={14} />
              {!collapsed && "Sign out"}
            </button>
          </form>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
