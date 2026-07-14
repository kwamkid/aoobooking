"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { hotelHref } from "@/lib/hotel/href";

// SettingsNav — tab แนวนอน underline-style (แบบ aoosocial) สำหรับหน้า settings
// active ตาม pathname · ทุก tab link path-based ผ่าน hotelHref
const TABS = [
  { href: "/settings/properties", label: "โรงแรม & สาขา" },
  { href: "/settings/package", label: "แพ็กเกจ" },
  { href: "/settings/billing", label: "ประวัติชำระเงิน" },
  { href: "/settings/audit", label: "บันทึกกิจกรรม" },
];

export function SettingsNav({ hotelSlug }: { hotelSlug: string }) {
  const pathname = usePathname();

  return (
    <div className="mb-6 flex gap-1 overflow-x-auto border-b border-border">
      {TABS.map((tab) => {
        const active = pathname.startsWith(`/${hotelSlug}${tab.href}`);
        return (
          <Link
            key={tab.href}
            href={hotelHref(tab.href, hotelSlug)}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
              active
                ? "border-brand text-brand"
                : "border-transparent text-fg-muted hover:text-fg"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
