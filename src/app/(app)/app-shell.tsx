"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
  ChevronsUpDown,
  Check,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  Plus,
  type LucideIcon,
} from "lucide-react";
import { hotelHref } from "@/lib/hotel/href";
import { ThemeToggle, Popover } from "@/components/ui";

type HotelRef = { slug: string; name: string };

// เมนูหลัก (ไม่รวม settings — settings fix ล่างสุดแยก)
type NavLeaf = { key: string; label?: string; href: string; Icon: LucideIcon; iconClass?: string };
type NavNode = NavLeaf | { section: string; key: string };

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
];

const SETTINGS_SUB: NavLeaf[] = [
  { key: "st-hotel", label: "โรงแรม & สาขา", href: "/settings/properties", Icon: Settings },
  { key: "st-package", label: "แพ็กเกจ", href: "/settings/package", Icon: Settings },
  { key: "st-billing", label: "ประวัติชำระเงิน", href: "/settings/billing", Icon: Settings },
  { key: "st-audit", label: "บันทึกกิจกรรม", href: "/settings/audit", Icon: Settings },
];

function initialOf(name: string) {
  return name.trim().charAt(0).toUpperCase() || "?";
}

export function AppShell({
  user,
  activeHotel,
  hotels,
  children,
}: {
  user: { name: string; email: string };
  activeHotel: HotelRef;
  hotels: HotelRef[];
  children: React.ReactNode;
}) {
  const t = useTranslations("nav");
  const pathname = usePathname();

  const [mobileOpen, setMobileOpen] = useState(false);
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

  const slug = activeHotel.slug;
  const withHotel = (href: string) => hotelHref(href, slug);

  // active: เทียบ path หลัง /[hotel] · most-specific
  const base = `/${slug}`;
  const subPath = pathname.startsWith(base) ? pathname.slice(base.length) || "/" : pathname;
  const allHrefs = useMemo(
    () => [
      ...NAV.filter((n): n is NavLeaf => "href" in n).map((n) => n.href),
      ...SETTINGS_SUB.map((s) => s.href),
    ],
    [],
  );
  function isActive(href: string) {
    if (subPath === href) return true;
    if (href === "/dashboard" && subPath === "/") return true;
    if (!subPath.startsWith(href)) return false;
    return !allHrefs.some((h) => h !== href && h.startsWith(href) && subPath.startsWith(h));
  }

  const [settingsOpen, setSettingsOpen] = useState(
    () => SETTINGS_SUB.some((s) => subPath.startsWith(s.href)),
  );

  const label = (n: { key: string; label?: string }) =>
    n.label ?? t(n.key as Parameters<typeof t>[0]);

  // account switcher popover
  const switchRef = useRef<HTMLButtonElement>(null);
  const [switchOpen, setSwitchOpen] = useState(false);
  // user dropdown popover
  const avatarRef = useRef<HTMLButtonElement>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const sidebarBody = (isMobile: boolean) => {
    const rail = !isMobile && collapsed;
    return (
      <div className="flex h-full flex-col">
        {/* ── logo (แค่ logo + AooBooking) ── */}
        <div
          className={`flex h-16 items-center border-b border-border px-4 ${
            rail ? "justify-center px-2" : "gap-2"
          }`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/aoobooking-logo.svg" alt="" className="h-8 w-8 shrink-0" />
          {!rail && <span className="text-base font-bold text-brand">AooBooking</span>}
          {isMobile && (
            <button
              onClick={() => setMobileOpen(false)}
              className="btn btn-ghost btn-sm ml-auto"
              aria-label="ปิดเมนู"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* ── account switcher (บนสุด ก่อนภาพรวม) ── */}
        {!rail && (
          <div className="border-b border-border p-3">
            <button
              ref={switchRef}
              onClick={() => setSwitchOpen((v) => !v)}
              className="flex w-full items-center gap-2.5 rounded-(--radius) border border-border bg-bg p-2 text-left transition hover:bg-bg-subtle"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-brand-soft text-sm font-bold text-brand">
                {initialOf(activeHotel.name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-fg">
                  {activeHotel.name}
                </span>
                <span className="block truncate text-xs text-fg-subtle">/{slug}</span>
              </span>
              <ChevronsUpDown size={15} className="shrink-0 text-fg-subtle" />
            </button>
            <Popover
              open={switchOpen}
              onClose={() => setSwitchOpen(false)}
              anchor={switchRef.current}
              align="start"
              ariaLabel="สลับโรงแรม"
            >
              <div className="max-h-72 overflow-y-auto p-1">
                {hotels.map((h) => (
                  <Link
                    key={h.slug}
                    href={hotelHref("/dashboard", h.slug)}
                    onClick={() => setSwitchOpen(false)}
                    className="flex items-center gap-2.5 rounded-sm px-2 py-2 hover:bg-bg-subtle"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-brand-soft text-xs font-bold text-brand">
                      {initialOf(h.name)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-fg">{h.name}</span>
                    {h.slug === slug && <Check size={15} className="shrink-0 text-brand" />}
                  </Link>
                ))}
              </div>
              <div className="border-t border-border p-1">
                <Link
                  href="/onboarding"
                  onClick={() => setSwitchOpen(false)}
                  className="flex items-center gap-2 rounded-sm px-2 py-2 text-sm text-fg-muted hover:bg-bg-subtle hover:text-fg"
                >
                  <Plus size={15} /> สร้าง / จัดการโรงแรม
                </Link>
              </div>
            </Popover>
          </div>
        )}

        {/* ── nav ── */}
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
          {NAV.map((n) => {
            if ("section" in n) {
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
            const active = isActive(n.href);
            return (
              <Link
                key={n.key}
                href={withHotel(n.href)}
                title={rail ? label(n) : undefined}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center rounded-(--radius) px-3 py-2.5 text-base font-medium transition-colors ${
                  rail ? "justify-center" : ""
                } ${
                  active
                    ? "bg-brand text-brand-fg shadow-(--shadow-brand)"
                    : "text-fg-muted hover:bg-bg-subtle hover:text-fg"
                }`}
              >
                <n.Icon
                  size={19}
                  className={`${rail ? "" : "mr-3"} ${active ? "text-brand-fg" : n.iconClass ?? ""}`}
                />
                {!rail && label(n)}
              </Link>
            );
          })}
        </nav>

        {/* ── settings (fix ล่างสุด) ── */}
        <div className="border-t border-border px-3 py-2">
          <button
            title={rail ? "ตั้งค่า" : undefined}
            onClick={() => {
              if (rail) toggleCollapsed();
              setSettingsOpen((v) => !v);
            }}
            className={`flex w-full items-center rounded-(--radius) px-3 py-2.5 text-base font-medium transition-colors ${
              rail ? "justify-center" : "justify-between"
            } ${
              SETTINGS_SUB.some((s) => isActive(s.href))
                ? "bg-brand-soft text-brand"
                : "text-fg-muted hover:bg-bg-subtle hover:text-fg"
            }`}
          >
            <span className="flex items-center">
              <Settings size={19} className={rail ? "" : "mr-3"} />
              {!rail && "ตั้งค่า"}
            </span>
            {!rail &&
              (settingsOpen ? (
                <ChevronDown size={15} className="opacity-60" />
              ) : (
                <ChevronRight size={15} className="opacity-60" />
              ))}
          </button>
          {settingsOpen && !rail && (
            <div className="mt-1 ml-8 space-y-0.5 pb-1">
              {SETTINGS_SUB.map((s) => (
                <Link
                  key={s.key}
                  href={withHotel(s.href)}
                  onClick={() => setMobileOpen(false)}
                  className={`block rounded-(--radius) px-3 py-2 text-sm font-medium transition-colors ${
                    isActive(s.href)
                      ? "bg-brand text-brand-fg shadow-(--shadow-brand)"
                      : "text-fg-muted hover:bg-bg-subtle hover:text-fg"
                  }`}
                >
                  {s.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-dvh overflow-hidden bg-bg">
      {/* desktop sidebar */}
      <aside
        className={`hidden shrink-0 border-r border-border bg-bg-elevated transition-all duration-200 lg:block ${
          collapsed ? "w-19" : "w-64"
        }`}
      >
        {sidebarBody(false)}
      </aside>

      {/* mobile drawer */}
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

      {/* main */}
      <div className="flex min-w-0 flex-1 flex-col">
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
            <button
              ref={avatarRef}
              onClick={() => setUserMenuOpen((v) => !v)}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-soft font-semibold text-brand"
              aria-label="เมนูผู้ใช้"
            >
              {initialOf(user.name || user.email)}
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
                <button className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm text-fg-muted hover:bg-bg-subtle hover:text-fg">
                  <LogOut size={15} className="text-danger" />
                  ออกจากระบบ
                </button>
              </form>
            </Popover>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</main>
      </div>
    </div>
  );
}
