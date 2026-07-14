"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

/* ============================================================================
   <Popover/> — floating menu primitive (port จาก aoosocial, restyle ด้วย tokens)

   Behaviour:
   - Portal ไป document.body → หนี ancestor ที่มี overflow:hidden ได้
   - position: fixed + reposition ตอน scroll/resize → เมนูเกาะ anchor ตลอด
   - คลิกนอก + Escape ปิด
   - ล้นจอล่าง → flip ขึ้นบน (ตัดสินครั้งเดียวต่อการเปิด กัน oscillate)
   - align: "start" (ชิดซ้าย anchor) | "end" (ชิดขวา anchor)

   ไม่ใช่ hover popover และไม่ใช่ modal (ไม่มี focus trap / scrim)
   ============================================================================ */

export interface PopoverProps {
  /** Controlled open state. */
  open: boolean;
  /** เรียกเมื่อ user ปิด (คลิกนอก, Escape). */
  onClose: () => void;
  /** Anchor element — อ่าน bounding box เพื่อจัดตำแหน่ง (ref.current ของ trigger). */
  anchor: HTMLElement | null;
  /** เนื้อหาในเมนู. */
  children: ReactNode;
  /** จัดแนวนอน — default "start" (ขอบซ้ายตรงกัน). */
  align?: "start" | "end";
  /** ความกว้างขั้นต่ำ (px). Default 220. */
  minWidth?: number;
  /** ความสูงสูงสุด (px) ก่อน scroll ภายใน. Default 360. */
  maxHeight?: number;
  /** ARIA role ของ surface — default "menu". */
  role?: string;
  /** ARIA label ของ surface. */
  ariaLabel?: string;
  /** class เพิ่มบน surface. */
  className?: string;
  /** z-index, default 300. */
  zIndex?: number;
}

function cx(...parts: (string | false | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export function Popover({
  open,
  onClose,
  anchor,
  children,
  align = "start",
  minWidth = 220,
  maxHeight = 360,
  role = "menu",
  ariaLabel,
  className,
  zIndex = 300,
}: PopoverProps) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  // ตัดสิน above/below ครั้งเดียวต่อการเปิดแล้วล็อกไว้ — ถ้า re-test ทุก scroll
  // popover สูงๆ จะกระพริบสลับบน↔ล่างตอนเลื่อนหน้า
  const placementRef = useRef<"below" | "above" | null>(null);

  const close = useCallback(() => {
    onClose();
    setPos(null);
    placementRef.current = null;
  }, [onClose]);

  // จัดตำแหน่ง — ตอนเปิด + ทุก scroll/resize (useLayoutEffect กัน flash ที่ 0,0)
  useLayoutEffect(() => {
    if (!open || !anchor) return;
    placementRef.current = null;
    function reposition() {
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const s = surfaceRef.current;
      const surfaceWidth = s?.offsetWidth ?? minWidth;
      const measured = s?.offsetHeight ?? 0;
      const pad = 8;

      let left = align === "end" ? rect.right - surfaceWidth : rect.left;
      left = Math.max(pad, Math.min(left, window.innerWidth - surfaceWidth - pad));

      // เฟรมแรกยังไม่ paint → measured = 0 → ใช้ maxHeight เป็น worst case
      // ก่อน แล้วค่อยล็อก placement เมื่อวัดความสูงจริงได้
      const estHeight = measured || maxHeight;
      if (placementRef.current === null || measured === 0) {
        const roomBelow = window.innerHeight - rect.bottom - pad;
        const roomAbove = rect.top - pad;
        const fitsBelow = estHeight <= roomBelow;
        const side = !fitsBelow && roomAbove > roomBelow ? "above" : "below";
        if (measured > 0) placementRef.current = side;
        else {
          const top =
            side === "above"
              ? Math.max(pad, rect.top - estHeight - 4)
              : rect.bottom + 4;
          setPos({ top, left });
          return;
        }
      }

      const top =
        placementRef.current === "above"
          ? Math.max(pad, rect.top - measured - 4)
          : rect.bottom + 4;

      setPos({ top, left });
    }
    reposition();
    // รันซ้ำหลัง paint เพื่อล็อก placement กับความสูงจริง
    const raf = requestAnimationFrame(reposition);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, anchor, align, minWidth, maxHeight]);

  // คลิกนอก + Escape ปิด — คลิกใน surface หรือบน anchor ไม่ปิด
  // (คลิก trigger ซ้ำ = toggle เป็นหน้าที่ของ caller)
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node | null;
      if (!target) return;
      if (surfaceRef.current?.contains(target)) return;
      if (anchor?.contains(target)) return;
      close();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, anchor, close]);

  if (!open || !pos || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={surfaceRef}
      role={role}
      aria-label={ariaLabel}
      // กันคลิกในเมนู bubble ไปโดน row-click ของ ancestor (table row ฯลฯ)
      onClick={(e) => e.stopPropagation()}
      className={cx(
        "fixed overflow-y-auto rounded-(--radius) border border-border bg-bg-elevated p-1 shadow-(--shadow-lg)",
        className,
      )}
      // ตำแหน่ง/ขนาดคำนวณ runtime — อนุญาต inline style เฉพาะตรงนี้
      style={{ top: pos.top, left: pos.left, minWidth, maxHeight, zIndex }}
    >
      {children}
    </div>,
    document.body,
  );
}
