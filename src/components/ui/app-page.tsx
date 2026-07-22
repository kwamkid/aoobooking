import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "./page-header";

/* ============================================================================
 *  AppPage — template หน้าหลังบ้านมาตรฐาน (rules.md #17.1)
 *  ทุกหน้าใน (app)/[hotel] ใช้โครงเดียวกัน: padding + PageHeader + tabs + เนื้อหา
 *
 *  <AppPage title="ห้องพัก" subtitle={hotel.name} action={<Button/>}
 *           tabs={<PropertyTabs items={...} />}>
 *    ...เนื้อหา...
 *  </AppPage>
 *
 *  server component ได้ (ไม่มี state) — อย่าใส่ "use client"
 * ========================================================================== */

export function AppPage({
  title,
  subtitle,
  action,
  tabs,
  back,
  children,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** ปุ่ม action หลักของหน้า (ขวาบน) */
  action?: React.ReactNode;
  /** แถวใต้ header เช่น <PropertyTabs/> (โชว์เองเมื่อมี — parent ไม่ต้องเช็ค null) */
  tabs?: React.ReactNode;
  /** หน้า detail/ฟอร์มลูก: ลิงก์ย้อนกลับเหนือ title เช่น { href, label: "การจอง" } */
  back?: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <div className="p-4 sm:p-8">
      {back && (
        <Link
          href={back.href}
          className="mb-2 inline-flex items-center gap-1 text-sm text-fg-muted transition-colors hover:text-fg"
        >
          <ChevronLeft size={16} />
          {back.label}
        </Link>
      )}
      <PageHeader title={title} subtitle={subtitle} action={action} />
      {tabs && <div className="mb-6">{tabs}</div>}
      {children}
    </div>
  );
}

/* ── PillTabs — แถบ pill ลิงก์ทั่วไป (สลับสาขา / filter สถานะ / โหมดดู) ───────
 * ส่ง href ที่คำนวณแล้ว — component นี้แค่ render + ไฮไลต์ตัว active */
export function PillTabs({
  items,
  activeId,
  show = true,
}: {
  items: { id: string; name: string; href: string }[];
  activeId: string;
  /** false = ไม่ render (เช่นโรงแรมสาขาเดียว) */
  show?: boolean;
}) {
  if (!show || items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((it) => (
        <Link
          key={it.id}
          href={it.href}
          className={`rounded-full px-3 py-1 text-sm transition-colors ${
            it.id === activeId
              ? "bg-brand text-brand-fg"
              : "border border-border text-fg-muted hover:bg-bg-subtle hover:text-fg"
          }`}
        >
          {it.name}
        </Link>
      ))}
    </div>
  );
}

// alias เดิม — สลับสาขาคือ use case แรกของ PillTabs (คง API เดิมทุกหน้า)
export const PropertyTabs = PillTabs;
