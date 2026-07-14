import { requireSuperAdmin } from "@/lib/auth";
import Link from "next/link";
import { Badge } from "@/components/ui";

export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireSuperAdmin();

  return (
    <div className="super-admin min-h-screen bg-bg">
      <header className="border-b border-border bg-bg-elevated px-6 py-3">
        <div className="flex items-center gap-6">
          <span className="inline-flex items-center gap-2 font-bold text-fg">
            AooBooking <Badge tone="danger">Super Admin</Badge>
          </span>
          <nav className="flex gap-4 text-sm text-fg-muted">
            <Link href="/super-admin/dashboard" className="hover:text-fg">
              ภาพรวม
            </Link>
            <Link href="/super-admin/hotels" className="hover:text-fg">
              โรงแรม
            </Link>
            <Link href="/super-admin/packages" className="hover:text-fg">
              แพ็กเกจ
            </Link>
          </nav>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
