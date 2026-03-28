"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { BarChart3, DatabaseZap, ShieldCheck } from "lucide-react";

import { type AppRole, isAdmin } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";

const links = [
  {
    href: "/dashboard" as Route,
    label: "Dashboard",
    icon: BarChart3,
    minimumRole: "viewer" as AppRole
  },
  {
    href: "/connections" as Route,
    label: "Connections",
    icon: DatabaseZap,
    minimumRole: "viewer" as AppRole
  },
  {
    href: "/admin" as Route,
    label: "Admin",
    icon: ShieldCheck,
    minimumRole: "admin" as AppRole
  }
];

export function SidebarNav({ role }: { role: AppRole }) {
  const pathname = usePathname();

  return (
    <nav className="space-y-2">
      {links
        .filter((link) => (link.minimumRole === "admin" ? isAdmin(role) : true))
        .map((link) => {
          const isActive = pathname === link.href;
          const Icon = link.icon;

          return (
            <Link
              key={link.href}
              className={cn(
                "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
              href={link.href}
            >
              <Icon className="h-4 w-4" />
              <span>{link.label}</span>
            </Link>
          );
        })}
    </nav>
  );
}
