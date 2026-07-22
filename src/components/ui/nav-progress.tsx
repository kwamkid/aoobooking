"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/* ============================================================================
 *  NavProgress — แถบ loading บนสุดจอ จับทุกการเปลี่ยนหน้า (เจ้าของขอ 2026-07-17)
 *
 *  เริ่ม: จับ click บน <a> ระดับ document (capture phase) = จุด "เริ่มโหลด" จริง
 *         + popstate (back/forward)
 *         ⚠️ ห้ามใช้ history.pushState เป็นสัญญาณเริ่ม — App Router เรียกมัน
 *         "ตอนหน้าใหม่ render เสร็จแล้ว" (ปลายทาง ไม่ใช่ต้นทาง — bugs.md §React)
 *  จบ:   pathname/searchParams เปลี่ยน = หน้าใหม่ commit แล้ว
 *  กันค้าง: คลิกลิงก์หน้าเดิมไม่เริ่ม + safety timeout 10s บังคับจบ
 *  หมายเหตุ: nav ที่เสร็จทันที (router cache) แถบจะไม่ทันโผล่ = ถูกต้อง ไม่ต้องมี
 * ========================================================================== */

export function NavProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [visible, setVisible] = useState(false);
  const [width, setWidth] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  // เร่งเป็นช่วงๆ แล้วค้างที่ 85% (ไม่รู้ progress จริง) — จบเมื่อหน้าใหม่มา
  const start = () => {
    clearTimers();
    setVisible(true);
    setWidth(15);
    timers.current.push(setTimeout(() => setWidth(45), 100));
    timers.current.push(setTimeout(() => setWidth(65), 400));
    timers.current.push(setTimeout(() => setWidth(80), 1200));
    timers.current.push(setTimeout(() => setWidth(85), 2500));
    // กันแถบค้าง (คลิกแล้ว nav ไม่เกิดจริง/พัง) — บังคับจบใน 10s
    timers.current.push(
      setTimeout(() => {
        setVisible(false);
        setWidth(0);
      }, 10000),
    );
  };

  useEffect(() => {
    // click จริงบนลิงก์ = จุดเริ่มโหลดที่ user รู้สึก — เร็วกว่าทุกสัญญาณของ router
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // เปิด tab ใหม่ ฯลฯ
      const a = (e.target as HTMLElement | null)?.closest?.("a[href]") as
        | HTMLAnchorElement
        | null;
      if (!a) return;
      if ((a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return; // ลิงก์ออกนอกแอป
      if (
        url.pathname === location.pathname &&
        url.search === location.search
      )
        return; // หน้าเดิม (เช่น anchor) — ไม่มีการโหลด
      start();
    };
    const onPop = () => start();

    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPop);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPop);
      clearTimers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // URL เปลี่ยน = หน้าใหม่ (หรือ loading.tsx) render แล้ว → วิ่งจบแล้วจาง
  useEffect(() => {
    if (!visible) return;
    clearTimers();
    setWidth(100);
    timers.current.push(
      setTimeout(() => {
        setVisible(false);
        setWidth(0);
      }, 250),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams]);

  return (
    <div
      aria-hidden
      className={`fixed inset-x-0 top-0 z-1100 h-0.5 transition-opacity duration-200 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      <div
        className="h-full bg-brand shadow-(--shadow-brand) transition-[width] duration-200 ease-out"
        // width = progress จำลอง (คำนวณ runtime) — จำเป็นต้องเป็น inline style
        style={{ width: `${width}%` }}
      />
    </div>
  );
}
