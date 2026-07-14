"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  LayoutDashboard,
  CalendarDays,
  BookOpen,
  ConciergeBell,
  Sparkles,
  BedDouble,
  Tag,
  Users,
  BarChart3,
  Settings,
  Menu,
  X,
} from "lucide-react";
import { hotelHref } from "@/lib/hotel/href";

// เมนู sidebar — ทุก link ผ่าน hotelHref() (?h=<slug>)
const NAV = [
  { key: "dashboard", href: "/dashboard", Icon: LayoutDashboard },
  { key: "calendar", href: "/calendar", Icon: CalendarDays },
  { key: "bookings", href: "/bookings", Icon: BookOpen },
  { key: "frontDesk", href: "/front-desk", Icon: ConciergeBell },
  { key: "housekeeping", href: "/housekeeping", Icon: Sparkles },
  { key: "rooms", href: "/rooms", Icon: BedDouble },
  { key: "rates", href: "/rates", Icon: Tag },
  { key: "guests", href: "/guests", Icon: Users },
  { key: "reports", href: "/reports", Icon: BarChart3 },
  { key: "settings", href: "/settings/properties", Icon: Settings },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const slug = searchParams.get("h") ?? "";
  const [open, setOpen] = useState(false); // mobile drawer

  const nav = (
    <nav className="space-y-0.5">
      {NAV.map(({ key, href, Icon }) => {
        const active = pathname.startsWith(href.split("/").slice(0, 2).join("/"));
        return (
          <Link
            key={key}
            href={slug ? hotelHref(href, slug) : href}
            onClick={() => setOpen(false)}
            className={`flex items-center gap-2.5 rounded-[var(--radius)] px-2.5 py-2 text-sm transition-colors ${
              active
                ? "bg-brand text-brand-fg"
                : "text-fg-muted hover:bg-bg-subtle hover:text-fg"
            }`}
          >
            <Icon size={17} />
            {t(key)}
          </Link>
        );
      })}
    </nav>
  );

  const brand = (
    <div className="px-2">
      <div className="text-sm font-semibold text-fg">AooBooking</div>
      {slug && <div className="font-mono text-xs text-fg-subtle">{slug}</div>}
    </div>
  );

  return (
    <div className="flex min-h-screen bg-bg">
      {/* --- desktop sidebar --- */}
      <aside className="hidden w-56 shrink-0 border-r border-border bg-bg-elevated p-4 md:block">
        <div className="mb-6">{brand}</div>
        {nav}
      </aside>

      {/* --- mobile drawer --- */}
      {open && (
        <>
          <button
            aria-label="ปิดเมนู"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 bg-black/40 md:hidden"
          />
          <aside className="fixed inset-y-0 left-0 z-50 w-64 border-r border-border bg-bg-elevated p-4 md:hidden">
            <div className="mb-6 flex items-center justify-between">
              {brand}
              <button onClick={() => setOpen(false)} className="btn btn-ghost btn-sm" aria-label="ปิด">
                <X size={18} />
              </button>
            </div>
            {nav}
          </aside>
        </>
      )}

      <div className="min-w-0 flex-1">
        {/* --- mobile top bar --- */}
        <header className="flex items-center gap-3 border-b border-border bg-bg-elevated px-4 py-3 md:hidden">
          <button onClick={() => setOpen(true)} className="btn btn-ghost btn-sm" aria-label="เปิดเมนู">
            <Menu size={20} />
          </button>
          <span className="text-sm font-semibold text-fg">AooBooking</span>
        </header>

        <main>{children}</main>
      </div>
    </div>
  );
}
