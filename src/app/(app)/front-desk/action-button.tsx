"use client";

import { useState, useTransition } from "react";

// ปุ่มเรียก server action + โชว์ error จาก RPC (เช่น "ยังมียอดค้าง" ตอน check-out)
export function ActionButton({
  action,
  hotelSlug,
  bookingId,
  label,
  variant = "primary",
}: {
  action: (fd: FormData) => Promise<void>;
  hotelSlug: string;
  bookingId: string;
  label: string;
  variant?: "primary" | "disabled-hint";
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    setError(null);
    const fd = new FormData();
    fd.set("hotelSlug", hotelSlug);
    fd.set("bookingId", bookingId);
    startTransition(async () => {
      try {
        await action(fd);
      } catch (e) {
        setError(e instanceof Error ? e.message : "ทำรายการไม่สำเร็จ");
      }
    });
  }

  return (
    <div className="text-right">
      <button
        onClick={onClick}
        disabled={pending}
        className={`rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-40 ${
          variant === "disabled-hint"
            ? "border border-amber-400 text-amber-700"
            : "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
        }`}
        title={variant === "disabled-hint" ? "มียอดค้าง — กดแล้วระบบจะเตือน" : undefined}
      >
        {pending ? "…" : label}
      </button>
      {error && <p className="mt-1 max-w-48 text-xs text-red-600">{error}</p>}
    </div>
  );
}
