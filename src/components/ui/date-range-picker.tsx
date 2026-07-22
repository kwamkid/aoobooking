"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Calendar, ChevronLeft, ChevronRight, X } from "lucide-react";

/**
 * `<DateRangePicker>` — ปฏิทินเลือกวัน/ช่วงวัน แบบ hand-rolled (ไม่มี lib)
 *
 * - `mode="range"` → value `{ from, to }` เป็น "YYYY-MM-DD" · คลิกวันแรกแล้ว
 *   คลิกวันที่สอง (ไฮไลต์ช่วงตาม hover ก่อน commit) แล้วปิดเอง
 * - `mode="single"` → value เป็น "YYYY-MM-DD" เดี่ยว
 * - จอกว้าง (≥640px) โชว์ 2 เดือนคู่ · จอเล็กโชว์เดือนเดียว (‹ › เลื่อนเดือน)
 * - preset เร็ว: วันนี้ / พรุ่งนี้ / 7 วันล่าสุด / 30 วันล่าสุด / เดือนนี้ (+ตลอดเวลา เมื่อ clearable)
 * - `minDate`/`maxDate` เป็น "YYYY-MM-DD" — วันนอกช่วงกดไม่ได้
 * - trigger ใช้ class `field` (สูง 40px เท่า input อื่น) · แสดงผลไทย (th-TH)
 *
 * popover วาง fixed ผ่าน portal (ตำแหน่งคำนวณ runtime — inline style เฉพาะจุดนี้)
 */

export type DateRange = { from: string; to: string };

interface CommonProps {
  /** โชว์ปุ่ม × ล้างค่า + preset "ตลอดเวลา" (range) — ต้องส่ง onClear คู่กัน */
  clearable?: boolean;
  onClear?: () => void;
  /** วันแรกที่เลือกได้ ("YYYY-MM-DD") */
  minDate?: string;
  /** วันสุดท้ายที่เลือกได้ ("YYYY-MM-DD") */
  maxDate?: string;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export interface DateRangePickerRangeProps extends CommonProps {
  mode: "range";
  value: DateRange | null;
  onChange: (value: DateRange) => void;
}

export interface DateRangePickerSingleProps extends CommonProps {
  mode: "single";
  value: string | null;
  onChange: (value: string) => void;
}

export type DateRangePickerProps =
  | DateRangePickerRangeProps
  | DateRangePickerSingleProps;

export function DateRangePicker(props: DateRangePickerProps) {
  const { mode, minDate, maxDate, disabled, placeholder, className, clearable, onClear } = props;

  const [open, setOpen] = useState(false);
  // "วันนี้" เก็บใน state และ set ตอนเปิด popover เท่านั้น — ตัว trigger render
  // จาก value ล้วนๆ จึง deterministic ตอน SSR/hydration (ไม่มี Date.now ใน render)
  const [today, setToday] = useState<Date | null>(null);

  // draft selection (range mode): คลิกแรก = start, คลิกสอง = end แล้ว commit
  const [start, setStart] = useState<Date | null>(null);
  const [end, setEnd] = useState<Date | null>(null);
  const [hoveredEnd, setHoveredEnd] = useState<Date | null>(null);

  // เดือนซ้ายที่โชว์อยู่ (เดือนขวา = +1)
  const [viewMonth, setViewMonth] = useState<Date>(() => startOfMonth(new Date(2000, 0, 1)));

  // ตำแหน่ง popover (fixed, คำนวณจาก trigger)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);

  // จอเล็ก → เดือนเดียว
  const [isNarrow, setIsNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const handler = () => setIsNarrow(mq.matches);
    handler();
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const minD = minDate ? fromIsoDate(minDate) : null;
  const maxD = maxDate ? fromIsoDate(maxDate) : null;

  const openPicker = () => {
    if (disabled) return;
    const now = stripTime(new Date());
    setToday(now);
    // hydrate draft จาก value ปัจจุบัน
    let s: Date | null = null;
    let e: Date | null = null;
    if (mode === "range" && props.value) {
      s = fromIsoDate(props.value.from);
      e = fromIsoDate(props.value.to);
    } else if (mode === "single" && props.value) {
      s = fromIsoDate(props.value);
    }
    setStart(s);
    setEnd(mode === "range" ? e : null);
    setHoveredEnd(null);
    setViewMonth(startOfMonth(s ?? now));
    setOpen(true);
  };

  const close = useCallback(() => {
    setOpen(false);
    setPos(null);
  }, []);

  // วางตำแหน่ง popover ใต้ trigger (ชนขอบจอ → เลื่อน/พลิกขึ้น)
  useLayoutEffect(() => {
    if (!open) return;
    function reposition() {
      const trg = triggerRef.current;
      if (!trg) return;
      const rect = trg.getBoundingClientRect();
      const m = popRef.current;
      const w = m?.offsetWidth ?? (isNarrow ? 300 : 600);
      const h = m?.offsetHeight ?? 380;
      const pad = 8;
      let left = rect.left;
      if (left + w > window.innerWidth - pad) {
        left = Math.max(pad, window.innerWidth - w - pad);
      }
      let top = rect.bottom + 4;
      if (top + h > window.innerHeight - pad) {
        top = Math.max(pad, rect.top - h - 4);
      }
      setPos({ top, left });
    }
    reposition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, isNarrow]);

  // click-outside + Esc ปิด
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node | null;
      if (!target) return;
      if (popRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
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
  }, [open, close]);

  // --- selection -----------------------------------------------------------
  const commitRange = (a: Date, b: Date) => {
    const [lo, hi] = a <= b ? [a, b] : [b, a];
    if (mode === "range") props.onChange({ from: toIsoDate(lo), to: toIsoDate(hi) });
    close();
  };

  const handleDayClick = (day: Date) => {
    if (mode === "single") {
      props.onChange(toIsoDate(day));
      close();
      return;
    }
    if (!start || end) {
      // เริ่มเลือกใหม่
      setStart(day);
      setEnd(null);
      setHoveredEnd(null);
      return;
    }
    commitRange(start, day);
  };

  const applyPreset = (from: Date, to: Date) => {
    // clamp ให้อยู่ในกรอบ min/max
    let lo = from;
    let hi = to;
    if (minD && lo < minD) lo = minD;
    if (maxD && hi > maxD) hi = maxD;
    if (lo > hi) return;
    if (mode === "range") {
      props.onChange({ from: toIsoDate(lo), to: toIsoDate(hi) });
    } else {
      props.onChange(toIsoDate(hi));
    }
    close();
  };

  const previewEnd = end ?? hoveredEnd;

  // --- trigger label -------------------------------------------------------
  // dd/mm/yyyy — สั้น เห็นเต็มสองฝั่งไม่โดน truncate (เจ้าของขอ 2026-07-17)
  const fmtSlash = (iso: string) => {
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  };
  let label: string;
  if (mode === "range" && props.value) {
    label = `${fmtSlash(props.value.from)} – ${fmtSlash(props.value.to)}`;
  } else if (mode === "single" && props.value) {
    label = fmtSlash(props.value);
  } else {
    label = placeholder ?? (mode === "range" ? "เลือกช่วงวันที่" : "เลือกวันที่");
  }
  const hasValue = !!props.value;

  const presetToday = today ?? stripTime(new Date(2000, 0, 1)); // ใช้จริงเฉพาะตอน popover เปิด (today ถูก set แล้ว)

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => (open ? close() : openPicker())}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cx(
          "field flex items-center gap-2 text-left cursor-pointer disabled:cursor-not-allowed disabled:opacity-45",
          className,
        )}
      >
        <Calendar size={16} className="shrink-0 text-fg-subtle" />
        <span className={cx("flex-1 truncate", !hasValue && "text-fg-subtle")}>
          {label}
        </span>
        {clearable && hasValue && (
          <span
            role="button"
            tabIndex={0}
            aria-label="ล้างวันที่"
            onClick={(e) => {
              e.stopPropagation();
              onClear?.();
              close();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.stopPropagation();
                onClear?.();
                close();
              }
            }}
            className="-mr-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-fg-subtle hover:bg-bg-subtle hover:text-fg"
          >
            <X size={13} />
          </span>
        )}
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popRef}
            role="dialog"
            aria-label={mode === "range" ? "เลือกช่วงวันที่" : "เลือกวันที่"}
            className={cx(
              "fixed z-[1000] flex flex-col gap-2 rounded-lg border border-border bg-bg-elevated p-3 shadow-lg",
              isNarrow ? "w-[300px]" : "w-[600px]",
              "max-w-[calc(100vw-16px)]",
              !pos && "invisible",
            )}
            style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
          >
            {/* preset เร็ว */}
            <div className="flex flex-wrap gap-1 border-b border-border pb-2">
              <PresetButton
                label="วันนี้"
                onClick={() => applyPreset(presetToday, presetToday)}
              />
              {mode === "range" && (
                <>
                  <PresetButton
                    label="พรุ่งนี้"
                    onClick={() =>
                      applyPreset(addDays(presetToday, 1), addDays(presetToday, 1))
                    }
                  />
                  <PresetButton
                    label="7 วันล่าสุด"
                    onClick={() => applyPreset(addDays(presetToday, -6), presetToday)}
                  />
                  <PresetButton
                    label="30 วันล่าสุด"
                    onClick={() => applyPreset(addDays(presetToday, -29), presetToday)}
                  />
                  <PresetButton
                    label="เดือนนี้"
                    onClick={() =>
                      applyPreset(startOfMonth(presetToday), endOfMonth(presetToday))
                    }
                  />
                  {clearable && (
                    <PresetButton
                      label="ตลอดเวลา"
                      onClick={() => {
                        onClear?.();
                        close();
                      }}
                    />
                  )}
                </>
              )}
            </div>

            {/* เดือน + ปุ่มเลื่อน */}
            <div className="relative">
              <button
                type="button"
                aria-label="เดือนก่อนหน้า"
                onClick={() => setViewMonth((m) => addMonths(m, -1))}
                className="absolute left-0 top-0 z-10 flex h-7 w-7 items-center justify-center rounded border border-border text-fg-muted cursor-pointer hover:bg-bg-subtle"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                type="button"
                aria-label="เดือนถัดไป"
                onClick={() => setViewMonth((m) => addMonths(m, 1))}
                className="absolute right-0 top-0 z-10 flex h-7 w-7 items-center justify-center rounded border border-border text-fg-muted cursor-pointer hover:bg-bg-subtle"
              >
                <ChevronRight size={14} />
              </button>
              <div className={cx("grid gap-4", isNarrow ? "grid-cols-1" : "grid-cols-2")}>
                <MonthGrid
                  month={viewMonth}
                  start={start}
                  previewEnd={mode === "range" ? previewEnd : null}
                  today={today}
                  minDate={minD}
                  maxDate={maxD}
                  onDayClick={handleDayClick}
                  onDayHover={(d) =>
                    mode === "range" && start && !end && setHoveredEnd(d)
                  }
                />
                {!isNarrow && (
                  <MonthGrid
                    month={addMonths(viewMonth, 1)}
                    start={start}
                    previewEnd={mode === "range" ? previewEnd : null}
                    today={today}
                    minDate={minD}
                    maxDate={maxD}
                    onDayClick={handleDayClick}
                    onDayHover={(d) =>
                      mode === "range" && start && !end && setHoveredEnd(d)
                    }
                  />
                )}
              </div>
            </div>

            {mode === "range" && (
              <div className="border-t border-border pt-2 text-center text-sm text-fg-muted">
                {!start
                  ? "คลิกเลือกวันเริ่มต้น"
                  : !end
                    ? `${formatThaiDay(start)} → คลิกเลือกวันสิ้นสุด`
                    : `${formatThaiDay(start)} → ${formatThaiDay(end)}`}
              </div>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  MonthGrid — ปฏิทิน 1 เดือน (จ-อา)                                  */
/* ------------------------------------------------------------------ */

const WEEKDAYS_TH = ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"];

function MonthGrid({
  month,
  start,
  previewEnd,
  today,
  minDate,
  maxDate,
  onDayClick,
  onDayHover,
}: {
  month: Date;
  start: Date | null;
  previewEnd: Date | null;
  today: Date | null;
  minDate: Date | null;
  maxDate: Date | null;
  onDayClick: (d: Date) => void;
  onDayHover: (d: Date) => void;
}) {
  const monthLabel = month.toLocaleDateString("th-TH", {
    month: "long",
    year: "numeric",
  });
  const days = buildMonthDays(month);

  // ขอบเขต range (เรียงแล้ว) สำหรับไฮไลต์
  let rangeLow: Date | null = null;
  let rangeHigh: Date | null = null;
  if (start) {
    if (!previewEnd) {
      rangeLow = start;
      rangeHigh = start;
    } else if (start <= previewEnd) {
      rangeLow = start;
      rangeHigh = previewEnd;
    } else {
      rangeLow = previewEnd;
      rangeHigh = start;
    }
  }

  return (
    <div>
      <div className="mb-2 text-center text-sm font-semibold text-fg">
        {monthLabel}
      </div>
      <div className="mb-1 grid grid-cols-7 gap-0.5 text-xs text-fg-subtle">
        {WEEKDAYS_TH.map((w) => (
          <div key={w} className="py-0.5 text-center">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {days.map((d, i) => {
          if (!d) return <div key={i} aria-hidden="true" />;
          const isStart = !!start && sameDay(d, start);
          const isEnd =
            !!previewEnd && !!start && sameDay(d, previewEnd) && !isStart;
          const isEndpoint = isStart || isEnd;
          const inRange =
            !!rangeLow && !!rangeHigh && d >= rangeLow && d <= rangeHigh && !isEndpoint;
          const isOut = (maxDate && d > maxDate) || (minDate && d < minDate);
          const isToday = !!today && sameDay(d, today);

          return (
            <button
              key={i}
              type="button"
              disabled={!!isOut}
              onClick={() => onDayClick(d)}
              onMouseEnter={() => !isOut && onDayHover(d)}
              className={cx(
                "flex h-8 items-center justify-center rounded text-sm transition-colors",
                isEndpoint && "bg-brand font-semibold text-brand-fg",
                inRange && "bg-brand-soft text-fg",
                !isEndpoint && !inRange && !isOut && "text-fg hover:bg-bg-subtle",
                isToday && !isEndpoint
                  ? "border border-brand"
                  : "border border-transparent",
                isOut
                  ? "cursor-not-allowed text-fg-subtle opacity-45"
                  : "cursor-pointer",
              )}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PresetButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded border border-border px-2 py-1 text-xs text-fg-muted cursor-pointer hover:border-brand hover:bg-brand-soft hover:text-fg"
    >
      {label}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Date helpers                                                       */
/* ------------------------------------------------------------------ */

function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

function fromIsoDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function stripTime(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** สร้าง cell ปฏิทิน 42 ช่อง (6 สัปดาห์) เริ่มวันจันทร์ — ช่องว่างเป็น null */
function buildMonthDays(month: Date): (Date | null)[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const padLeft = (first.getDay() + 6) % 7; // จันทร์ = 0
  const cells: (Date | null)[] = [];
  for (let i = 0; i < padLeft; i++) cells.push(null);
  for (let i = 1; i <= last.getDate(); i++) {
    cells.push(new Date(month.getFullYear(), month.getMonth(), i));
  }
  while (cells.length < 42) cells.push(null);
  return cells;
}

/** "YYYY-MM-DD" → "14 ก.ค. 2569" (พ.ศ. ตาม th-TH locale) */
function formatThaiDate(iso: string): string {
  const d = fromIsoDate(iso);
  if (!d) return iso;
  return d.toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatThaiDay(d: Date): string {
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "short" });
}
