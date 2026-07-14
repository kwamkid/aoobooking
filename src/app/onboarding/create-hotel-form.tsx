"use client";

import { useState } from "react";
import { createHotel } from "./actions";

export function CreateHotelForm() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      action={async (fd) => {
        setPending(true);
        setError(null);
        try {
          await createHotel(fd);
        } catch (e) {
          setPending(false);
          setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
        }
      }}
      className="flex flex-col gap-3"
    >
      <input
        name="name"
        placeholder="ชื่อโรงแรม (เช่น บ้านสวนรีสอร์ท)"
        required
        className="rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
      />
      <input
        name="slug"
        placeholder="slug (เว้นว่างได้ — จะสร้างจากชื่อ)"
        pattern="[a-z0-9-]*"
        className="rounded-lg border border-neutral-300 px-3 py-2 font-mono text-sm dark:border-neutral-700 dark:bg-neutral-900"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-neutral-900 px-4 py-2 font-medium text-white transition hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-900"
      >
        {pending ? "กำลังสร้าง..." : "สร้างโรงแรม"}
      </button>
    </form>
  );
}
