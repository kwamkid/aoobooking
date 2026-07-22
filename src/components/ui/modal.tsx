"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/* ============================================================================
 *  Modal — overlay + กล่องกลางจอ
 *  - ปิดด้วย Escape / คลิกฉากหลัง / ปุ่ม ×
 *  - focus trap เบื้องต้น (Tab วนอยู่ในกล่อง)
 *  - lock body scroll ระหว่างเปิด (ชดเชย scrollbar width กัน layout shift)
 *  - responsive: mobile เต็มกว้าง margin เล็ก (padding scrim = clamp)
 *  - style ผ่าน design token เท่านั้น — .modal-scrim/.modal-panel ใน globals.css
 * ========================================================================== */

export interface ModalProps {
  /** เปิด/ปิด modal */
  open: boolean;
  /** เรียกเมื่อคลิกฉากหลัง, กด Escape, หรือกดปุ่มปิด */
  onClose: () => void;
  /** หัวข้อใน header */
  title?: ReactNode;
  /** คำอธิบายใต้ title */
  description?: ReactNode;
  /** เนื้อหา */
  children: ReactNode;
  /** ปุ่ม/action ด้านล่าง (ชิดขวา) */
  footer?: ReactNode;
  /** ความกว้างสูงสุด (px) — default 480 */
  maxWidth?: number;
  /** ซ่อนปุ่มปิด (×) */
  hideCloseButton?: boolean;
  /** false = คลิกฉากหลังไม่ปิด */
  dismissOnBackdrop?: boolean;
}

// ตัด [tabindex="-1"] ทุกชนิด — เช่นปุ่ม ⓘ HintIcon ที่ตั้งใจไม่รับ Tab
const FOCUSABLE_SELECTOR =
  'a[href]:not([tabindex="-1"]), button:not([disabled]):not([tabindex="-1"]), textarea:not([disabled]):not([tabindex="-1"]), input:not([disabled]):not([tabindex="-1"]), select:not([disabled]):not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  maxWidth = 480,
  hideCloseButton = false,
  dismissOnBackdrop = true,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Escape ปิด + focus trap เบื้องต้น (Tab วนใน panel)
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "Tab" && panelRef.current) {
        const focusables = Array.from(
          panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
        );
        if (focusables.length === 0) {
          e.preventDefault();
          panelRef.current.focus();
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;
        if (e.shiftKey) {
          if (active === first || !panelRef.current.contains(active)) {
            e.preventDefault();
            last.focus();
          }
        } else if (active === last || !panelRef.current.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // lock body scroll ระหว่างเปิด + ชดเชย scrollbar width กันหน้าขยับซ้าย-ขวา
  // (macOS overlay scrollbar ได้ 0 = no-op)
  useEffect(() => {
    if (!open) return;
    const scrollbarW = window.innerWidth - document.documentElement.clientWidth;
    const prevOverflow = document.body.style.overflow;
    const prevPadRight = document.body.style.paddingRight;
    document.body.style.overflow = "hidden";
    if (scrollbarW > 0) {
      document.body.style.paddingRight = `${scrollbarW}px`;
    }
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPadRight;
    };
  }, [open]);

  // focus panel ตอนเปิด — keyboard user กด Tab ต่อได้ทันที
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  const handleBackdropClick = useCallback(() => {
    if (dismissOnBackdrop) onClose();
  }, [dismissOnBackdrop, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? "aoo-modal-title" : undefined}
      onClick={handleBackdropClick}
      className="modal-scrim fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-6"
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        // maxWidth = ค่าคำนวณจาก prop (runtime) — จำเป็นต้องเป็น inline style
        style={{ maxWidth }}
        className="modal-panel flex max-h-full w-full min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-bg-elevated shadow-lg outline-none"
      >
        {(title || !hideCloseButton) && (
          <header className="flex items-start gap-3 border-b border-border px-5 pb-3 pt-4">
            <div className="min-w-0 flex-1">
              {title && (
                <h2 id="aoo-modal-title" className="m-0 text-lg font-semibold text-fg">
                  {title}
                </h2>
              )}
              {description && (
                <div className="mt-1 text-base text-fg-muted">{description}</div>
              )}
            </div>
            {!hideCloseButton && (
              <button
                type="button"
                onClick={onClose}
                aria-label="ปิด"
                className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-sm text-fg-muted transition-colors hover:bg-bg-subtle hover:text-fg"
              >
                <X size={18} />
              </button>
            )}
          </header>
        )}

        {/* flex-1 + min-h-0 = ให้ overflow เลื่อนในกล่อง ไม่ดันกล่องเกิน max-h */}
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>

        {footer && (
          <footer className="flex items-center justify-end gap-2 border-t border-border px-5 pb-4 pt-3">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
