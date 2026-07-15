import type { ComponentProps } from "react";
import { HintIcon } from "./tooltip";

function cx(...parts: (string | false | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

// Field wrapper (label + input/select/children) — layout สม่ำเสมอทั้งฟอร์ม
// hint = คำอธิบายใน tooltip (ⓘ ข้าง label) — ใส่เมื่อ label อย่างเดียวสื่อไม่พอ
export function Field({
  label,
  hint,
  children,
  className,
}: {
  label?: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      {label && (
        <label className="field-label">
          {label}
          {hint && <HintIcon>{hint}</HintIcon>}
        </label>
      )}
      {children}
    </div>
  );
}

// Input — text/number/date/time ฯลฯ
export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cx("field", className)} {...props} />;
}

// Textarea
export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cx("field", className)} {...props} />;
}
