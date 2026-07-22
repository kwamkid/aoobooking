"use client";

import { useRef, useState, useId, type ReactNode } from "react";
import { HelpCircle } from "lucide-react";
import { Popover } from "./popover";

/* ============================================================================
 *  Tooltip / HintIcon — คำอธิบายสั้นๆ ข้าง label
 *  - สร้างบน Popover (floating primitive เดิม) — ไม่เขียน position logic ซ้ำ
 *  - เปิดด้วย hover, focus (keyboard) หรือ click (touch) → touch ใช้ได้ด้วย
 *  - style ผ่าน design token เท่านั้น
 * ========================================================================== */

export function HintIcon({
  children,
  label = "ดูคำอธิบาย",
}: {
  /** เนื้อหาคำอธิบาย */
  children: ReactNode;
  /** aria-label ของปุ่ม */
  label?: string;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <>
      <button
        ref={ref}
        type="button" // สำคัญ: กัน submit form ตอนกด
        // ไม่รับ Tab — กด Tab ในฟอร์มต้องไล่ input ตามลำดับ ไม่แวะ ⓘ ทุกช่อง
        // (เจ้าของทัก 2026-07-22) · เมาส์ hover/click + touch ยังเปิดได้ปกติ
        tabIndex={-1}
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="ml-1 inline-flex h-4 w-4 shrink-0 cursor-help items-center justify-center align-text-top text-fg-subtle transition-colors hover:text-brand"
      >
        <HelpCircle size={15} />
      </button>
      <Popover
        open={open}
        onClose={() => setOpen(false)}
        anchor={ref.current}
        align="start"
        role="tooltip" // ไม่ใช่ menu (default ของ Popover)
        ariaLabel={label}
        minWidth={240}
        className="max-w-72"
      >
        <div id={id} className="p-3 text-sm leading-relaxed text-fg-muted">
          {children}
        </div>
      </Popover>
    </>
  );
}
