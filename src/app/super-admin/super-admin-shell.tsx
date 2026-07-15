"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  Package,
  Ticket,
  ScrollText,
  Menu,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  LayoutGrid,
  type LucideIcon,
} from "lucide-react";
import { ThemeToggle, Popover, Badge } from "@/components/ui";

// ============================================================================
// SuperAdminShell — โครงเดียวกับ AppShell ของหลังบ้านโรงแรม (sidebar ย่อได้ +
// mobile drawer + top bar) แต่เป็นโซน platform: accent แดงอิฐผ่าน .super-admin
// (layout ห่อไว้ → token --brand ใน subtree เปลี่ยนเอง ไม่ต้องแก้ component)
// ============================================================================

type NavItem = { href: string; label: string; Icon: LucideIcon; iconClass?: string };

const NAV: NavItem[] = [
  { href: "/super-admin/dashboard", label: "ภาพรวม", Icon: LayoutDashboard, iconClass: "text-orange" },
  { href: "/super-admin/hotels", label: "โรงแรม", Icon: Building2, iconClass: "text-info" },
  { href: "/super-admin/packages", label: "แพ็กเกจ", Icon: Package, iconClass: "text-green" },
  { href: "/super-admin/promo-codes", label: "โค้ดโปรโมชัน", Icon: Ticket, iconClass: "text-purple" },
  { href: "/super-admin/audit", label: "บันทึกกิจกรรม", Icon: ScrollText, iconClass: "text-fg-muted" },
];

function initialOf(s: string) {
  return s.trim().charAt(0).toUpperCase() || "?";
}

export function SuperAdminShell({
  user,
  children,
}: {
  user: { name: string; email: string };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem("aoo-sa-sidebar-collapsed") === "true");
  }, []);
  function toggleCollapsed() {
    setCollapsed((v) => {
      localStorage.setItem("aoo-sa-sidebar-collapsed", String(!v));
      return !v;
    });
  }

  // active แบบ most-specific (กัน /hotels active ทับ /hotels/[id] ผิด)
  function isActive(href: string) {
    if (pathname === href) return true;
    if (!pathname.startsWith(href)) return false;
    return !NAV.some((n) => n.href !== href && n.href.startsWith(href) && pathname.startsWith(n.href));
  }

  const avatarRef = useRef<HTMLButtonElement>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const sidebarBody = (isMobile: boolean) => {
    const rail = !isMobile && collapsed;
    return (
      <div className="flex h-full flex-col">
        {/* logo + badge */}
        <div
          className={`flex h-16 items-center border-b border-border px-4 ${
            rail ? "justify-center px-2" : "gap-2"
          }`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/aoobooking-logo.svg" alt="" width={32} height={32} className="h-8 w-8 shrink-0" />
          {!rail && (
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-bold text-brand">AooBooking</span>
              <Badge tone="danger">Super Admin</Badge>
            </span>
          )}
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

        {/* nav */}
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
          {NAV.map((n) => {
            const active = isActive(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                title={rail ? n.label : undefined}
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
                {!rail && n.label}
              </Link>
            );
          })}
        </nav>

        {/* กลับหน้าโรงแรม (fix ล่างสุด) */}
        <div className="border-t border-border px-3 py-2">
          <Link
            href="/onboarding"
            title={rail ? "กลับหน้าโรงแรม" : undefined}
            onClick={() => setMobileOpen(false)}
            className={`flex items-center rounded-(--radius) px-3 py-2.5 text-base font-medium text-fg-muted transition-colors hover:bg-bg-subtle hover:text-fg ${
              rail ? "justify-center" : ""
            }`}
          >
            <LayoutGrid size={19} className={rail ? "" : "mr-3"} />
            {!rail && "กลับหน้าโรงแรม"}
          </Link>
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
                <div className="text-sm font-medium text-fg">{user.name || "Super Admin"}</div>
                <div className="text-xs text-fg-muted">{user.email}</div>
              </div>
              <div className="p-1">
                <Link
                  href="/onboarding"
                  onClick={() => setUserMenuOpen(false)}
                  className="flex items-center gap-2 rounded-sm px-3 py-2 text-sm text-fg-muted hover:bg-bg-subtle hover:text-fg"
                >
                  <LayoutGrid size={15} /> กลับหน้าโรงแรม
                </Link>
              </div>
              <form action="/auth/sign-out" method="post" className="border-t border-border p-1">
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
