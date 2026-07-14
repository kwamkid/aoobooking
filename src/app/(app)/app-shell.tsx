"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  ChevronDown,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import { hotelHref } from "@/lib/hotel/href";
import { ThemeToggle, Popover } from "@/components/ui";

// ============================================================================
// AppShell — sidebar แบบ codelab-school-supa (เจ้าของขอ 2026-07-14)
// - ย่อเป็น icon rail ได้ (จำใน localStorage) + tooltip (title) ตอนย่อ
// - ไอคอนมีสีประจำเมนู · active = พื้น brand + เงานุ่ม (--shadow-brand)
// - กลุ่มเมนูพับได้ + auto-expand ตาม path · section label คั่นหมวด
// - top bar: hamburger (mobile) / ปุ่มย่อ (desktop) / ThemeToggle / avatar dropdown
// ============================================================================

type NavLeaf = {
  key: string; // i18n key ใน nav.* หรือ label ตรง
  label?: string; // ถ้าไม่ใช้ i18n
  href: string;
  Icon?: LucideIcon;
  iconClass?: string; // สีประจำเมนู (token)
};
type NavNode =
  | (NavLeaf & { subItems?: never; section?: never })
  | { key: string; label?: string; Icon?: LucideIcon; iconClass?: string; subItems: NavLeaf[]; href?: never; section?: never }
  | { section: string; key: string; href?: never; subItems?: never };

const NAV: NavNode[] = [
  { key: "dashboard", href: "/dashboard", Icon: LayoutDashboard, iconClass: "text-orange" },
  { section: "งานหน้าเคาน์เตอร์", key: "sec-front" },
  { key: "calendar", href: "/calendar", Icon: CalendarDays, iconClass: "text-purple" },
  { key: "bookings", href: "/bookings", Icon: BookOpen, iconClass: "text-green" },
  { key: "frontDesk", href: "/front-desk", Icon: ConciergeBell, iconClass: "text-red" },
  { key: "guests", href: "/guests", Icon: Users, iconClass: "text-info" },
  { section: "จัดการ", key: "sec-manage" },
  { key: "housekeeping", href: "/housekeeping", Icon: Sparkles, iconClass: "text-purple" },
  { key: "rooms", href: "/rooms", Icon: BedDouble, iconClass: "text-orange" },
  { key: "rates", href: "/rates", Icon: Tag, iconClass: "text-green" },
  { key: "reports", href: "/reports", Icon: BarChart3, iconClass: "text-info" },
  {
    key: "settings",
    Icon: Settings,
    iconClass: "text-fg-muted",
    subItems: [
      { key: "st-hotel", label: "โรงแรม & สาขา", href: "/settings/properties" },
      { key: "st-package", label: "แพ็กเกจ", href: "/settings/package" },
      { key: "st-billing", label: "ประวัติชำระเงิน", href: "/settings/billing" },
      { key: "st-audit", label: "บันทึกกิจกรรม", href: "/settings/audit" },
    ],
  },
];

export function AppShell({
  user,
  children,
}: {
  user: { name: string; email: string };
  children: React.ReactNode;
}) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const slug = searchParams.get("h") ?? "";

  const [mobileOpen, setMobileOpen] = useState(false);
  // desktop: ย่อเป็น icon rail (จำค่า)
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    setCollapsed(localStorage.getItem("aoo-sidebar-collapsed") === "true");
  }, []);
  function toggleCollapsed() {
    setCollapsed((v) => {
      localStorage.setItem("aoo-sidebar-collapsed", String(!v));
      return !v;
    });
  }

  const [expanded, setExpanded] = useState<string[]>([]);
  // auto-expand กลุ่มที่ path ปัจจุบันอยู่ข้างใน
  useEffect(() => {
    const open = NAV.filter(
      (n) => "subItems" in n && n.subItems?.some((s) => pathname.startsWith(s.href)),
    ).map((n) => n.key);
    setExpanded((prev) => [...new Set([...prev, ...open])]);
  }, [pathname]);

  // active แบบ most-specific (กัน /settings/properties ไป active ทับ /settings/audit)
  const allHrefs = useMemo(() => {
    const hs: string[] = [];
    for (const n of NAV) {
      if ("href" in n && n.href) hs.push(n.href);
      if ("subItems" in n && n.subItems) n.subItems.forEach((s) => hs.push(s.href));
    }
    return hs;
  }, []);
  function isActive(href: string) {
    if (pathname === href) return true;
    if (!pathname.startsWith(href + "/") && !(pathname.startsWith(href) && href !== "/"))
      return false;
    if (!pathname.startsWith(href)) return false;
    return !allHrefs.some(
      (h) => h !== href && h.startsWith(href) && pathname.startsWith(h),
    );
  }

  const label = (n: { key: string; label?: string }) =>
    n.label ?? t(n.key as Parameters<typeof t>[0]);

  const withHotel = (href: string) => (slug ? hotelHref(href, slug) : href);

  // ── user dropdown (ใช้ Popover ที่เพิ่ง port) ──
  const avatarRef = useRef<HTMLButtonElement>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const initial = (user.name || user.email || "?").trim().charAt(0).toUpperCase();

  const sidebarBody = (isMobile: boolean) => {
    const rail = !isMobile && collapsed;
    return (
      <div className="flex h-full flex-col">
        {/* logo */}
        <div
          className={`flex h-16 items-center border-b border-border px-4 ${
            rail ? "justify-center px-2" : "justify-between"
          }`}
        >
          {!rail && (
            <div>
              <div className="text-base font-bold text-brand">AooBooking</div>
              {slug && <div className="font-mono text-xs text-fg-subtle">{slug}</div>}
            </div>
          )}
          {rail && <div className="text-lg font-bold text-brand">A</div>}
          {isMobile && (
            <button
              onClick={() => setMobileOpen(false)}
              className="btn btn-ghost btn-sm"
              aria-label="ปิดเมนู"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* nav */}
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
          {NAV.map((n) => {
            if ("section" in n && n.section) {
              return (
                <div key={n.key} className="mt-4 border-t border-border pt-3 first:mt-0">
                  {!rail && (
                    <div className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-fg-subtle">
                      {n.section}
                    </div>
                  )}
                </div>
              );
            }

            if ("subItems" in n && n.subItems) {
              const groupActive = n.subItems.some((s) => isActive(s.href));
              const open = expanded.includes(n.key);
              return (
                <div key={n.key}>
                  <button
                    title={rail ? label(n) : undefined}
                    onClick={() => {
                      if (rail) toggleCollapsed(); // ขยายก่อนถึงกดกลุ่มได้
                      setExpanded((prev) =>
                        prev.includes(n.key)
                          ? prev.filter((k) => k !== n.key)
                          : [...prev, n.key],
                      );
                    }}
                    className={`flex w-full items-center rounded-(--radius) px-3 py-2.5 text-base font-medium transition-colors ${
                      rail ? "justify-center" : "justify-between"
                    } ${
                      groupActive
                        ? "bg-brand-soft text-brand"
                        : "text-fg-muted hover:bg-bg-subtle hover:text-fg"
                    }`}
                  >
                    <span className="flex items-center">
                      {n.Icon && (
                        <n.Icon
                          size={19}
                          className={`${rail ? "" : "mr-3"} ${
                            groupActive ? "text-brand" : n.iconClass ?? ""
                          }`}
                        />
                      )}
                      {!rail && label(n)}
                    </span>
                    {!rail &&
                      (open ? (
                        <ChevronDown size={15} className="opacity-60" />
                      ) : (
                        <ChevronRight size={15} className="opacity-60" />
                      ))}
                  </button>
                  {open && !rail && (
                    <div className="mt-1 ml-8 space-y-0.5">
                      {n.subItems.map((s) => (
                        <Link
                          key={s.key}
                          href={withHotel(s.href)}
                          onClick={() => setMobileOpen(false)}
                          className={`block rounded-(--radius) px-3 py-2 text-base font-medium transition-colors ${
                            isActive(s.href)
                              ? "bg-brand text-brand-fg shadow-(--shadow-brand)"
                              : "text-fg-muted hover:bg-bg-subtle hover:text-fg"
                          }`}
                        >
                          {label(s)}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            }

            const leaf = n as NavLeaf;
            const active = isActive(leaf.href);
            return (
              <Link
                key={leaf.key}
                href={withHotel(leaf.href)}
                title={rail ? label(leaf) : undefined}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center rounded-(--radius) px-3 py-2.5 text-base font-medium transition-colors ${
                  rail ? "justify-center" : ""
                } ${
                  active
                    ? "bg-brand text-brand-fg shadow-(--shadow-brand)"
                    : "text-fg-muted hover:bg-bg-subtle hover:text-fg"
                }`}
              >
                {leaf.Icon && (
                  <leaf.Icon
                    size={19}
                    className={`${rail ? "" : "mr-3"} ${
                      active ? "text-brand-fg" : leaf.iconClass ?? ""
                    }`}
                  />
                )}
                {!rail && label(leaf)}
              </Link>
            );
          })}
        </nav>
      </div>
    );
  };

  return (
    <div className="flex h-dvh overflow-hidden bg-bg">
      {/* ── desktop sidebar ── */}
      <aside
        className={`hidden shrink-0 border-r border-border bg-bg-elevated transition-all duration-200 lg:block ${
          collapsed ? "w-[76px]" : "w-64"
        }`}
      >
        {sidebarBody(false)}
      </aside>

      {/* ── mobile drawer ── */}
      {mobileOpen && (
        <>
          <button
            aria-label="ปิดเมนู"
            onClick={() => setMobileOpen(false)}
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          />
          <aside className="fixed inset-y-0 left-0 z-50 w-64 border-r border-border bg-bg-elevated lg:hidden">
            {sidebarBody(true)}
          </aside>
        </>
      )}

      {/* ── main ── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* top bar */}
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border bg-bg-elevated px-4">
          <button
            onClick={() => setMobileOpen(true)}
            className="btn btn-ghost btn-sm lg:hidden"
            aria-label="เปิดเมนู"
          >
            <Menu size={20} />
          </button>
          <button
            onClick={toggleCollapsed}
            className="btn btn-ghost btn-sm hidden lg:inline-flex"
            title={collapsed ? "ขยายเมนู" : "ย่อเมนู"}
            aria-label={collapsed ? "ขยายเมนู" : "ย่อเมนู"}
          >
            {collapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}
          </button>

          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />

            {/* user dropdown */}
            <button
              ref={avatarRef}
              onClick={() => setUserMenuOpen((v) => !v)}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-soft font-semibold text-brand"
              aria-label="เมนูผู้ใช้"
            >
              {initial}
            </button>
            <Popover
              open={userMenuOpen}
              onClose={() => setUserMenuOpen(false)}
              anchor={avatarRef.current}
              align="end"
              ariaLabel="เมนูผู้ใช้"
            >
              <div className="border-b border-border px-3 py-2.5">
                <div className="text-sm font-medium text-fg">{user.name || "ผู้ใช้"}</div>
                <div className="text-xs text-fg-muted">{user.email}</div>
              </div>
              <form action="/auth/sign-out" method="post" className="p-1">
                <button className="flex w-full items-center gap-2 rounded-(--radius-sm) px-3 py-2 text-left text-sm text-fg-muted hover:bg-bg-subtle hover:text-fg">
                  <LogOut size={15} className="text-danger" />
                  ออกจากระบบ
                </button>
              </form>
            </Popover>
          </div>
        </header>

        {/* page content */}
        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {children}
        </main>
      </div>
    </div>
  );
}
