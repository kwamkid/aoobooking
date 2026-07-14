"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * `<TimePicker>` / `<TimeRangePicker>` — เลือกเวลาแบบ hand-rolled (ไม่มี lib)
 *
 * - `<TimePicker value onChange step? min? max? />` — เวลาเดี่ยว "HH:MM" (24 ชม.)
 * - `<TimeRangePicker value={{ from, to }} onChange />` — คู่เริ่ม/สิ้นสุด
 *   (เปลี่ยนเวลาเริ่มแล้วเวลาสิ้นสุดจะขยับตามถ้า from >= to)
 * - dropdown ลิสต์ slot ทุก `step` นาที (default 30) + พิมพ์เองได้ —
 *   normalize รับ "9" / "930" / "9.30" / "0930" → "09:30"
 * - input ใช้ class `field` (สูง 40px เท่า input อื่น)
 */

/* ------------------------------------------------------------------ */
/*  helpers                                                            */
/* ------------------------------------------------------------------ */

function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

function generateTimeSlots(step: number, min?: string, max?: string): string[] {
  const slots: string[] = [];
  const minMinutes = min ? parseTime(min) : 0;
  const maxMinutes = max ? parseTime(max) : 24 * 60 - 1;
  for (let m = 0; m < 24 * 60; m += step) {
    if (m >= minMinutes && m <= maxMinutes) {
      const hh = String(Math.floor(m / 60)).padStart(2, "0");
      const mm = String(m % 60).padStart(2, "0");
      slots.push(`${hh}:${mm}`);
    }
  }
  return slots;
}

function parseTime(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** ตัดวินาทีทิ้ง — ค่าจาก DB อาจเป็น "HH:MM:SS" */
function formatTimeDisplay(t: string): string {
  if (!t) return "";
  const [h, m] = t.split(":");
  return `${h}:${m}`;
}

/**
 * normalize ข้อความที่พิมพ์เอง → "HH:MM" (24 ชม.)
 * รับ "9", "930", "9:3", "9.30", "0930" ฯลฯ — คืน '' ถ้าไม่ใช่เวลาที่ valid
 */
export function normalizeTimeInput(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, "");
  if (!digits) return "";
  let h: number, m: number;
  if (digits.length <= 2) {
    h = parseInt(digits, 10);
    m = 0;
  } else if (digits.length === 3) {
    h = parseInt(digits.slice(0, 1), 10);
    m = parseInt(digits.slice(1), 10);
  } else {
    h = parseInt(digits.slice(0, 2), 10);
    m = parseInt(digits.slice(2, 4), 10);
  }
  if (isNaN(h) || isNaN(m) || h > 23 || m > 59) return "";
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function addMinutes(time: string, minutes: number): string {
  const total = parseTime(time) + minutes;
  const hh = String(Math.floor(total / 60) % 24).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

/* ------------------------------------------------------------------ */
/*  TimePicker — เวลาเดี่ยว                                            */
/* ------------------------------------------------------------------ */

export interface TimePickerProps {
  /** "HH:MM" (24 ชม.) หรือ "" */
  value: string;
  onChange: (value: string) => void;
  /** ระยะห่าง slot (นาที) — default 30 */
  step?: number;
  /** เวลาแรกที่เลือกได้ "HH:MM" */
  min?: string;
  /** เวลาสุดท้ายที่เลือกได้ "HH:MM" */
  max?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function TimePicker({
  value,
  onChange,
  step = 30,
  min,
  max,
  placeholder = "เวลา",
  disabled = false,
  className,
}: TimePickerProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(formatTimeDisplay(value));
  // ก่อนผู้ใช้เริ่มพิมพ์ → โชว์ทุก slot (ไม่งั้นค่าที่เลือกอยู่จะกรองลิสต์เหลือแถวเดียว)
  const [typing, setTyping] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const listRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const slots = useMemo(() => generateTimeSlots(step, min, max), [step, min, max]);

  // sync ข้อความเมื่อ value เปลี่ยนจากภายนอก (เช่น start เปลี่ยนแล้วดัน end)
  useEffect(() => {
    if (!open) setText(formatTimeDisplay(value));
  }, [value, open]);

  // กรอง slot ตามที่พิมพ์ — รับ "8", "8:", "8.00", "0800", "830" ฯลฯ
  const filtered = useMemo(() => {
    if (!typing) return slots;
    const raw = text.trim();
    if (!raw) return slots;

    const sep = raw.search(/[:.]/);
    let hourPart: string;
    let minPart: string | null;
    if (sep >= 0) {
      hourPart = raw.slice(0, sep).replace(/[^0-9]/g, "");
      minPart = raw.slice(sep + 1).replace(/[^0-9]/g, "");
    } else {
      const digits = raw.replace(/[^0-9]/g, "");
      if (digits.length <= 2) {
        hourPart = digits;
        minPart = null;
      } else {
        hourPart = digits.slice(0, digits.length - 2);
        minPart = digits.slice(-2);
      }
    }

    return slots.filter((s) => {
      const [sh, sm] = s.split(":");
      const hourOk =
        hourPart === "" || Number(hourPart) === Number(sh) || sh.startsWith(hourPart);
      if (!hourOk) return false;
      if (minPart == null || minPart === "") return true;
      return sm.startsWith(minPart);
    });
  }, [slots, text, typing]);

  // เปิดลิสต์ → reset typing + highlight ค่าปัจจุบัน
  useEffect(() => {
    if (!open) {
      setHighlight(-1);
      setTyping(false);
      return;
    }
    setTyping(false);
    const idx = value ? slots.findIndex((s) => s === formatTimeDisplay(value)) : -1;
    setHighlight(idx >= 0 ? idx : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ให้ highlight อยู่ในช่วงเมื่อลิสต์ถูกกรอง
  useEffect(() => {
    if (!open) return;
    setHighlight((h) =>
      filtered.length === 0 ? -1 : Math.min(Math.max(h, 0), filtered.length - 1),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered.length]);

  // เลื่อน item ที่ highlight ให้เห็น — ตอนเพิ่งเปิดให้ค่าที่เลือกอยู่กลางลิสต์
  const justOpened = useRef(false);
  useEffect(() => {
    justOpened.current = open;
  }, [open]);
  useEffect(() => {
    if (!open || highlight < 0) return;
    const container = listRef.current;
    const el = container?.querySelector(
      `[data-index="${highlight}"]`,
    ) as HTMLElement | null;
    if (!container || !el) return;
    if (justOpened.current) {
      container.scrollTop =
        el.offsetTop - container.clientHeight / 2 + el.clientHeight / 2;
      justOpened.current = false;
    } else {
      const top = el.offsetTop;
      const bottom = top + el.clientHeight;
      if (top < container.scrollTop) container.scrollTop = top;
      else if (bottom > container.scrollTop + container.clientHeight)
        container.scrollTop = bottom - container.clientHeight;
    }
  }, [highlight, open]);

  const commit = (raw: string) => {
    const normalized = normalizeTimeInput(raw);
    if (normalized) {
      onChange(normalized);
      setText(normalized);
    } else {
      setText(formatTimeDisplay(value)); // พิมพ์ไม่ valid → คืนค่าเดิม
    }
  };

  const pick = (slot: string) => {
    onChange(slot);
    setText(slot);
    setTyping(false);
    setOpen(false);
  };

  // ปิดเมื่อคลิกนอกกล่อง (dropdown แบบ absolute ธรรมดา — ไม่มี focus layer มากวน)
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        commit(text);
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, text]);

  return (
    <div ref={wrapRef} className="relative">
      <input
        type="text"
        inputMode="numeric"
        value={text}
        disabled={disabled}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onChange={(e) => {
          setText(e.target.value);
          setTyping(true);
          if (!open) setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            if (!open) {
              setOpen(true);
              return;
            }
            setHighlight((h) =>
              filtered.length === 0 ? -1 : (h + 1) % filtered.length,
            );
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            if (!open) {
              setOpen(true);
              return;
            }
            setHighlight((h) =>
              filtered.length === 0 ? -1 : (h - 1 + filtered.length) % filtered.length,
            );
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (highlight >= 0 && filtered[highlight]) pick(filtered[highlight]);
            else if (filtered.length > 0 && text.replace(/[^0-9:]/g, ""))
              pick(filtered[0]);
            else commit(text);
            setOpen(false);
          } else if (e.key === "Escape") {
            setText(formatTimeDisplay(value));
            setOpen(false);
          }
        }}
        className={cx("field", className)}
      />
      {open && !disabled && (
        <div
          ref={listRef}
          className="absolute z-50 mt-1 max-h-[200px] w-full min-w-[100px] overflow-y-auto overscroll-contain rounded-lg border border-border bg-bg-elevated p-1 shadow-lg"
          onWheel={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
        >
          {filtered.length === 0 ? (
            <div className="py-3 text-center text-sm text-fg-subtle">ไม่พบเวลา</div>
          ) : (
            filtered.map((slot, i) => (
              <button
                key={slot}
                type="button"
                data-index={i}
                onMouseDown={(e) => e.preventDefault()} // กัน input blur ก่อนคลิกติด
                onMouseEnter={() => setHighlight(i)}
                onClick={() => pick(slot)}
                className={cx(
                  "flex w-full cursor-pointer select-none items-center justify-center rounded px-2 py-1.5 text-sm outline-none",
                  i === highlight ? "bg-brand-soft text-fg" : "text-fg-muted",
                  formatTimeDisplay(value) === slot && "font-semibold text-brand",
                )}
              >
                {slot}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  TimeRangePicker — คู่เริ่ม/สิ้นสุด                                  */
/* ------------------------------------------------------------------ */

export type TimeRange = { from: string; to: string };

export interface TimeRangePickerProps {
  /** { from, to } เป็น "HH:MM" (ว่างได้ = "") */
  value: TimeRange;
  onChange: (value: TimeRange) => void;
  step?: number;
  min?: string;
  max?: string;
  fromPlaceholder?: string;
  toPlaceholder?: string;
  disabled?: boolean;
  className?: string;
}

export function TimeRangePicker({
  value,
  onChange,
  step = 30,
  min,
  max,
  fromPlaceholder = "เริ่ม",
  toPlaceholder = "สิ้นสุด",
  disabled = false,
  className,
}: TimeRangePickerProps) {
  // เปลี่ยนเวลาเริ่ม: ดันเวลาสิ้นสุดตามเฉพาะเมื่อจะ invalid (to <= from) หรือยังว่าง
  const handleFromChange = (v: string) => {
    let to = value.to;
    if (!to || parseTime(to) <= parseTime(v)) to = addMinutes(v, 60);
    onChange({ from: v, to });
  };

  return (
    <div className={cx("grid grid-cols-2 gap-2", className)}>
      <TimePicker
        value={value.from}
        onChange={handleFromChange}
        placeholder={fromPlaceholder}
        disabled={disabled}
        step={step}
        min={min}
        max={max}
      />
      <TimePicker
        value={value.to}
        onChange={(v) => onChange({ ...value, to: v })}
        placeholder={toPlaceholder}
        disabled={disabled}
        step={step}
        min={value.from || min}
        max={max}
      />
    </div>
  );
}
