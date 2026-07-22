import { BedDouble } from "lucide-react";

/* RoomBadge — ป้ายเบอร์ห้อง (chip สี brand: ไอคอนเตียง + ตัวเลข tabular)
 * ใช้ที่เดียวกันทั้งระบบ: ตารางการจอง · งานวันนี้ · หน้ารายละเอียดการจอง
 * rooms: "101" | "101, 102" | ["101","102"] — ว่าง/ยังไม่ assign = ไม่ render */

export function RoomBadge({
  rooms,
  size = "md",
}: {
  rooms: string | string[] | null | undefined;
  size?: "sm" | "md";
}) {
  const list = (Array.isArray(rooms) ? rooms : rooms ? [rooms] : []).filter(Boolean);
  if (list.length === 0) return null;
  return (
    <span
      className={`inline-flex items-center rounded-sm bg-brand-soft font-semibold tabular-nums text-brand-strong ${
        size === "sm" ? "gap-1 px-1.5 py-0.5 text-sm" : "gap-1.5 px-2 py-0.5 text-base"
      }`}
      title={`ห้อง ${list.join(", ")}`}
    >
      <BedDouble size={size === "sm" ? 13 : 15} aria-hidden />
      {list.join(", ")}
    </span>
  );
}
