"use client";

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
} from "lucide-react";
import { hotelHref } from "@/lib/hotel/href";

// เมนู sidebar — ทุก link ผ่าน hotelHref() (?h=<slug>)
// (ซ่อนตามสิทธิ์เพิ่มตอนทำ A3 เต็ม — ตอนนี้แต่ละ page มี guard อยู่แล้ว)
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

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-56 shrink-0 border-r border-neutral-200 p-4 dark:border-neutral-800 md:block">
        <div className="mb-6 px-2">
          <div className="text-sm font-semibold">AooBooking</div>
          {slug && <div className="font-mono text-xs text-neutral-400">{slug}</div>}
        </div>
        <nav className="space-y-0.5">
          {NAV.map(({ key, href, Icon }) => {
            const active = pathname.startsWith(href.split("/").slice(0, 2).join("/"));
            return (
              <Link
                key={key}
                href={slug ? hotelHref(href, slug) : href}
                className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm ${
                  active
                    ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                    : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                }`}
              >
                <Icon size={16} />
                {t(key)}
              </Link>
            );
          })}
        </nav>
      </aside>

      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
