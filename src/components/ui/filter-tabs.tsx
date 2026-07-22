import Link from "next/link";

/* ============================================================================
 *  FilterTabs — "filter cards" กรองหน้า list (port จาก codelab StatusFilterTabs)
 *  การ์ดละสถานะ: label เล็กบน + count ใหญ่ · active = สีทึบ · count 0 ซ่อนเอง
 *  (ยกเว้น always เช่น "ทั้งหมด") · link-based → ใช้กับหน้า server-render ที่กรอง
 *  ผ่าน searchParams ได้เลย ไม่ต้องมี client state
 *
 *  <FilterTabs activeId={s} tabs={[
 *    { id: "all", label: "ทั้งหมด", count: 12, href: "?s=all", tone: "neutral", always: true },
 *    { id: "inhouse", label: "พักอยู่ตอนนี้", count: 3, href: "?s=inhouse", tone: "success" },
 *  ]} />
 * ========================================================================== */

export type FilterTabTone =
  | "neutral"
  | "brand"
  | "success"
  | "warning"
  | "danger"
  | "info";

// สี active เป็นสีสดทึบ (ตัวหนังสือขาว — ยกเว้นเหลืองใช้ตัวเข้ม อ่านชัดทั้ง light/dark)
// inactive = พื้น soft + ตัวหนังสือ -strong (rules #16.1)
const TONE: Record<
  FilterTabTone,
  { active: string; inactive: string; label: string; count: string }
> = {
  neutral: {
    active: "bg-(--c-neutral-700) text-white",
    inactive: "bg-bg-elevated",
    label: "text-fg-muted",
    count: "text-fg",
  },
  brand: {
    active: "bg-brand text-brand-fg",
    inactive: "bg-brand-soft",
    label: "text-brand-strong",
    count: "text-brand-strong",
  },
  success: {
    active: "bg-success text-white",
    inactive: "bg-success-soft",
    label: "text-success-strong",
    count: "text-success-strong",
  },
  warning: {
    active: "bg-warning text-(--c-neutral-900)",
    inactive: "bg-warning-soft",
    label: "text-warning-strong",
    count: "text-warning-strong",
  },
  danger: {
    active: "bg-danger text-white",
    inactive: "bg-danger-soft",
    label: "text-danger-strong",
    count: "text-danger-strong",
  },
  info: {
    active: "bg-info text-white",
    inactive: "bg-info-soft",
    label: "text-info-strong",
    count: "text-info-strong",
  },
};

export type FilterTab = {
  id: string;
  label: string;
  count: number;
  href: string;
  tone?: FilterTabTone;
  /** โชว์เสมอแม้ count = 0 (เช่น tab "ทั้งหมด") */
  always?: boolean;
};

export function FilterTabs({
  tabs,
  activeId,
  className,
}: {
  tabs: FilterTab[];
  activeId: string;
  className?: string;
}) {
  // count 0 = ไม่มีอะไรให้กรอง → ซ่อน (ลดเสียงรบกวน) · เว้นตัว always กับตัวที่ active อยู่
  const visible = tabs.filter((t) => t.always || t.count > 0 || t.id === activeId);

  return (
    <div className={`flex flex-wrap items-stretch gap-2.5 ${className ?? ""}`}>
      {visible.map((t) => {
        const tone = TONE[t.tone ?? "neutral"];
        const active = t.id === activeId;
        return (
          <Link
            key={t.id}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`flex min-w-24 flex-col items-center justify-center rounded-(--radius-lg) px-5 py-3 transition-all ${
              active
                ? `${tone.active} shadow-(--shadow)`
                : `${tone.inactive} border border-border hover:shadow-(--shadow-sm) hover:border-border-strong`
            }`}
          >
            <span
              className={`whitespace-nowrap text-sm font-semibold ${
                active ? "" : tone.label
              }`}
            >
              {t.label}
            </span>
            <span
              className={`mt-0.5 text-2xl font-bold leading-none tabular-nums ${
                active ? "" : tone.count
              }`}
            >
              {t.count}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
