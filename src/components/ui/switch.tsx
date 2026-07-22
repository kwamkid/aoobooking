"use client";

/* Switch — ปุ่มเปิด/ปิดแบบ toggle (role="switch")
 * ใช้ token ล้วน: เปิด = success · ปิด = border-strong · ปุ่มกลม bg-elevated */

export function Switch({
  checked,
  onChange,
  disabled = false,
  ariaLabel,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? "bg-success" : "bg-border-strong"
      }`}
    >
      <span
        className={`inline-block size-5 rounded-full bg-bg-elevated shadow transition-transform ${
          checked ? "translate-x-[1.375rem]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
