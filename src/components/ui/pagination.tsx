"use client";

import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/* ==========================================================================
 *  Pagination — Prev / 1 … 4 [5] 6 … 20 / Next + pageSize selector (optional)
 *
 *  - Stateless: parent เป็นเจ้าของ currentPage/pageSize แล้วรับ event กลับ
 *  - จอเล็ก (< sm) ยุบแถวเลขหน้าเป็น "X / Y" เพื่อไม่ให้ล้น
 *  - pageSize selector + สรุปจำนวน แสดงเมื่อส่ง pageSize/totalItems มา
 * ========================================================================== */

export interface PaginationProps {
  /** หน้าปัจจุบัน (1-based) */
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  /** จำนวนรายการทั้งหมด — ส่งมาเพื่อโชว์ "1–10 จาก 123" */
  totalItems?: number;
  /** ขนาดหน้า — ต้องส่งคู่กับ onPageSizeChange ถึงจะโชว์ตัวเลือก */
  pageSize?: number;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  /** จำนวนเลขหน้าข้างละกี่ตัวรอบหน้าปัจจุบันก่อนยุบเป็น … (default 1) */
  siblingCount?: number;
  /** ปิดปุ่มทั้งหมด (เช่นระหว่าง transition) */
  disabled?: boolean;
  className?: string;
}

/** สร้างรายการ token ของเลขหน้า: ตัวเลข + "…" — โชว์หน้า 1 กับหน้าสุดท้ายเสมอ */
function buildPages(
  current: number,
  count: number,
  siblings: number,
): (number | "…")[] {
  const total = siblings * 2 + 5; // first, last, current, 2 ellipses, siblings
  if (count <= total) {
    return Array.from({ length: count }, (_, i) => i + 1);
  }
  const left = Math.max(current - siblings, 1);
  const right = Math.min(current + siblings, count);
  const showLeftDots = left > 2;
  const showRightDots = right < count - 1;
  const pages: (number | "…")[] = [1];
  if (showLeftDots) pages.push("…");
  for (
    let p = showLeftDots ? left : 2;
    p <= (showRightDots ? right : count - 1);
    p++
  ) {
    pages.push(p);
  }
  if (showRightDots) pages.push("…");
  pages.push(count);
  return pages;
}

function cx(...parts: (string | false | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  totalItems,
  pageSize,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50],
  siblingCount = 1,
  disabled = false,
  className,
}: PaginationProps) {
  const showSizer = pageSize != null && onPageSizeChange != null;
  const showNav = totalPages > 1;
  if (!showNav && !showSizer && totalItems == null) return null;

  const go = (p: number) => {
    if (disabled) return;
    const clamped = Math.min(Math.max(p, 1), totalPages);
    if (clamped !== currentPage) onPageChange(clamped);
  };

  // สรุปช่วงรายการ "1–10 จาก 123" (ต้องรู้ทั้ง totalItems + pageSize)
  let rangeInfo: ReactNode = null;
  if (totalItems != null) {
    if (pageSize != null) {
      const start = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
      const end = Math.min(currentPage * pageSize, totalItems);
      rangeInfo = (
        <span className="text-sm text-fg-subtle whitespace-nowrap">
          {start}–{end} จาก {totalItems}
        </span>
      );
    } else {
      rangeInfo = (
        <span className="text-sm text-fg-subtle whitespace-nowrap">
          ทั้งหมด {totalItems}
        </span>
      );
    }
  }

  return (
    <div
      className={cx(
        "flex flex-wrap items-center gap-x-4 gap-y-2 py-3",
        showSizer || rangeInfo ? "justify-between" : "justify-center",
        className,
      )}
    >
      {(showSizer || rangeInfo) && (
        <div className="flex items-center gap-3">
          {showSizer && (
            <label className="flex items-center gap-2 text-sm text-fg-muted">
              แสดง
              <select
                className="field h-8 w-auto py-0 text-sm"
                value={pageSize}
                disabled={disabled}
                onChange={(e) => onPageSizeChange(Number(e.target.value))}
              >
                {pageSizeOptions.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
          )}
          {rangeInfo}
        </div>
      )}

      {showNav && (
        <nav className="flex items-center gap-1" aria-label="Pagination">
          <button
            type="button"
            className="btn btn-ghost btn-sm px-2"
            title="หน้าก่อนหน้า"
            disabled={disabled || currentPage <= 1}
            onClick={() => go(currentPage - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          {/* จอเล็ก: ยุบเป็น X / Y */}
          <span className="px-2 text-sm text-fg-muted sm:hidden">
            {currentPage} / {totalPages}
          </span>

          {/* จอ ≥ sm: แถวเลขหน้าเต็ม */}
          <span className="hidden items-center gap-1 sm:flex">
            {buildPages(currentPage, totalPages, siblingCount).map((p, i) =>
              p === "…" ? (
                <span
                  key={`dots-${i}`}
                  className="min-w-6 text-center text-sm text-fg-subtle"
                >
                  …
                </span>
              ) : (
                <button
                  key={p}
                  type="button"
                  aria-current={p === currentPage ? "page" : undefined}
                  className={cx(
                    "btn btn-sm min-w-8 px-2",
                    p === currentPage ? "btn-primary" : "btn-ghost",
                  )}
                  disabled={disabled}
                  onClick={() => go(p)}
                >
                  {p}
                </button>
              ),
            )}
          </span>

          <button
            type="button"
            className="btn btn-ghost btn-sm px-2"
            title="หน้าถัดไป"
            disabled={disabled || currentPage >= totalPages}
            onClick={() => go(currentPage + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </nav>
      )}
    </div>
  );
}
