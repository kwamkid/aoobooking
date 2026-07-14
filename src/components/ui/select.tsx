"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Popover } from "./popover";

/* ============================================================================
   <Select/> — custom dropdown (แทน native <select> ที่คุมหน้าตาไม่ได้)
   สร้างบน <Popover/> — trigger สูง 40px เท่า .field ทุก control

   ใช้ได้ 2 โหมด:
   - controlled:   <Select value={v} onChange={setV} options={...} />
   - uncontrolled: <Select name="x" defaultValue="a" options={...} />
     (มี name → render <input type="hidden"> ให้ FormData ใช้ได้ใน <form>)
   ============================================================================ */

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  options: SelectOption[];
  /** controlled value — ถ้าให้มา ต้องคู่กับ onChange. */
  value?: string;
  /** ค่าเริ่มต้นแบบ uncontrolled (ใช้ใน <form> ที่ไม่ต้อง state). */
  defaultValue?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** ชื่อ field ใน FormData — render hidden input ให้อัตโนมัติ. */
  name?: string;
  className?: string;
  id?: string;
  ariaLabel?: string;
}

function cx(...parts: (string | false | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export function Select({
  options,
  value,
  defaultValue,
  onChange,
  placeholder = "— เลือก —",
  disabled,
  name,
  className,
  id,
  ariaLabel,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [internal, setInternal] = useState(defaultValue ?? "");
  const [highlight, setHighlight] = useState(0);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const current = value !== undefined ? value : internal;
  const selected = options.find((o) => o.value === current);

  function openMenu() {
    const idx = options.findIndex((o) => o.value === current);
    setHighlight(idx >= 0 ? idx : 0);
    setOpen(true);
  }

  function pick(v: string) {
    if (value === undefined) setInternal(v);
    onChange?.(v);
    setOpen(false);
    triggerRef.current?.focus();
  }

  // เลื่อน option ที่ highlight ให้อยู่ในสายตาเสมอ (เมนูยาวแล้ว scroll)
  useEffect(() => {
    if (!open) return;
    optionRefs.current[highlight]?.scrollIntoView({ block: "nearest" });
  }, [open, highlight]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const opt = options[highlight];
      if (opt) pick(opt.value);
    }
    // Escape → Popover จัดการปิดเองผ่าน onClose
  }

  return (
    <>
      {name && <input type="hidden" name={name} value={current} />}
      <button
        ref={triggerRef}
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
        className={cx(
          "field flex items-center justify-between gap-2 text-left",
          "disabled:cursor-not-allowed disabled:opacity-45",
          className,
        )}
      >
        <span className={cx("truncate", !selected && "text-fg-subtle")}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown className="size-4 shrink-0 text-fg-muted" aria-hidden />
      </button>

      <Popover
        open={open}
        onClose={() => setOpen(false)}
        anchor={triggerRef.current}
        role="listbox"
        ariaLabel={ariaLabel}
        minWidth={triggerRef.current?.offsetWidth ?? 220}
      >
        {options.length === 0 && (
          <div className="px-3 py-2 text-sm text-fg-subtle">ไม่มีตัวเลือก</div>
        )}
        {options.map((opt, i) => {
          const isSelected = opt.value === current;
          return (
            <button
              key={opt.value || `__empty-${i}`}
              ref={(el) => {
                optionRefs.current[i] = el;
              }}
              type="button"
              role="option"
              aria-selected={isSelected}
              tabIndex={-1}
              onMouseEnter={() => setHighlight(i)}
              onClick={() => pick(opt.value)}
              className={cx(
                "flex w-full items-center justify-between gap-2 rounded-(--radius-sm) px-3 py-2 text-left text-base",
                i === highlight && "bg-bg-subtle",
                isSelected ? "text-brand" : "text-fg",
              )}
            >
              <span className="truncate">{opt.label}</span>
              {isSelected && <Check className="size-4 shrink-0 text-brand" aria-hidden />}
            </button>
          );
        })}
      </Popover>
    </>
  );
}
