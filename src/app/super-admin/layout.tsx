import { requireSuperAdmin } from "@/lib/auth";
import Link from "next/link";

export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireSuperAdmin();

  return (
    <div className="super-admin min-h-screen">
      <header className="border-b border-red-900/20 bg-red-950 px-6 py-3 text-white">
        <div className="flex items-center gap-6">
          <span className="font-bold">AooBooking · Super Admin</span>
          <nav className="flex gap-4 text-sm text-red-200">
            <Link href="/super-admin/dashboard">ภาพรวม</Link>
            <Link href="/super-admin/hotels">โรงแรม</Link>
            <Link href="/super-admin/packages">แพ็กเกจ</Link>
          </nav>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
