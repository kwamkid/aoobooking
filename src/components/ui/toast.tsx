"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle2, AlertCircle, Info, X, type LucideProps } from "lucide-react";

/* ============================================================================
 *  Toast — มุมขวาบน (stack ลงล่าง) + auto-hide + กดปิดได้
 *
 *  ใช้งาน:
 *    1) ห่อ app ด้วย <ToastProvider> (src/app/layout.tsx)
 *    2) ใน client component: const toast = useToast();
 *       toast.ok("บันทึกแล้ว") / toast.err("ผิดพลาด") / toast.info("แจ้งเตือน")
 *       override เวลาได้: toast.ok("...", 6000)
 *
 *  สี tone ผูกกับ design token: ok=success · err=danger · info=info
 *  animation: เลื่อนเข้า (.toast-enter ใน globals.css) / จางออก (transition)
 * ========================================================================== */

export type ToastTone = "ok" | "err" | "info";

const TONE_MAP: Record<ToastTone, { icon: React.FC<LucideProps>; iconClass: string }> = {
  ok: { icon: CheckCircle2, iconClass: "text-success" },
  err: { icon: AlertCircle, iconClass: "text-danger" },
  info: { icon: Info, iconClass: "text-info" },
};

/* ------------------------------------------------------------------ */
/*  Toast — bubble เดี่ยว (export เผื่อ ad-hoc / custom position)       */
/* ------------------------------------------------------------------ */

export interface ToastProps {
  children: ReactNode;
  tone?: ToastTone;
  /** false = สถานะกำลังจางออก (opacity 0 + เลื่อนขวาเล็กน้อย) */
  visible?: boolean;
  /** กดปิด — ถ้าไม่ส่งมา จะไม่แสดงปุ่ม × */
  onDismiss?: () => void;
  className?: string;
}

export function Toast({
  children,
  tone = "info",
  visible = true,
  onDismiss,
  className,
}: ToastProps) {
  const t = TONE_MAP[tone];
  const IconComp = t.icon;

  return (
    <div
      role="status"
      aria-live="polite"
      className={[
        "toast-enter pointer-events-auto flex w-fit max-w-[26rem] items-start gap-2.5",
        "rounded-lg border border-border bg-bg-elevated px-4 py-2.5",
        "text-sm font-medium text-fg shadow-lg",
        "transition-[opacity,transform] duration-200 ease-out",
        visible ? "opacity-100 translate-x-0" : "opacity-0 translate-x-2",
        className ?? "",
      ].join(" ")}
    >
      <IconComp size={18} className={`mt-0.5 shrink-0 ${t.iconClass}`} aria-hidden />
      <div className="min-w-0 break-words">{children}</div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="ปิด"
          className="-mr-1 mt-0.5 inline-flex shrink-0 cursor-pointer items-center justify-center rounded-sm p-0.5 text-fg-subtle transition-colors hover:text-fg"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ToastProvider + useToast                                           */
/* ------------------------------------------------------------------ */

interface ToastItem {
  id: number;
  tone: ToastTone;
  message: ReactNode;
  leaving: boolean;
}

export interface ToastApi {
  ok: (message: ReactNode, durationMs?: number) => void;
  err: (message: ReactNode, durationMs?: number) => void;
  info: (message: ReactNode, durationMs?: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** auto-hide default (ms) — override รายครั้งผ่าน arg ที่สอง */
const DEFAULT_TTL = 4000;
/** เวลาจางออก — ต้อง match duration-200 ใน <Toast> */
const LEAVE_MS = 200;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  // id แบบ monotonic ผ่าน ref — re-render ไม่ reset (กัน key ชนกัน)
  const nextIdRef = useRef(1);
  const timersRef = useRef<Map<number, number>>(new Map());

  const dismiss = useCallback((id: number) => {
    const timer = timersRef.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timersRef.current.delete(id);
    }
    // mark leaving → เล่น fade-out ก่อน แล้วค่อยถอดออกจริง
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)),
    );
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, LEAVE_MS);
  }, []);

  const push = useCallback(
    (tone: ToastTone, message: ReactNode, durationMs = DEFAULT_TTL) => {
      const id = nextIdRef.current++;
      setToasts((prev) => [...prev, { id, tone, message, leaving: false }]);
      const timer = window.setTimeout(() => dismiss(id), durationMs);
      timersRef.current.set(id, timer);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      ok: (message, durationMs) => push("ok", message, durationMs),
      err: (message, durationMs) => push("err", message, durationMs),
      info: (message, durationMs) => push("info", message, durationMs),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* ขวาล่าง — อันใหม่โผล่ล่างสุด (ใกล้มุม) แล้วดันขึ้น (flex-col-reverse) */}
      {toasts.length > 0 && (
        <div className="pointer-events-none fixed bottom-4 right-4 z-9999 flex flex-col-reverse items-end gap-2">
          {toasts.map((t) => (
            <Toast
              key={t.id}
              tone={t.tone}
              visible={!t.leaving}
              onDismiss={() => dismiss(t.id)}
            >
              {t.message}
            </Toast>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}

/** hook เรียก toast จาก client component ไหนก็ได้ — throw ถ้าลืมห่อ Provider
 *  (จะได้เจอตอน dev ไม่ใช่เงียบหาย) */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error(
      "useToast() called outside <ToastProvider>. Wrap the app root in <ToastProvider>.",
    );
  }
  return ctx;
}
