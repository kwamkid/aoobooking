import type { ComponentProps } from "react";

function cx(...parts: (string | false | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

// Field wrapper (label + input/select/children) — layout สม่ำเสมอทั้งฟอร์ม
export function Field({
  label,
  children,
  className,
}: {
  label?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      {label && <label className="field-label">{label}</label>}
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
