"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { X } from "lucide-react";
import {
  SearchBox,
  Select,
  DateRangePicker,
  type DateRange,
} from "@/components/ui";

/* Filter bar หน้าการจอง — auto-apply ทุกตัว ไม่มีปุ่มค้นหา (เจ้าของขอ 2026-07-17):
 * พิมพ์ค้นหา = debounce 400ms แล้วกรองเลย · เลือกวัน/ประเภทห้อง = กรองทันที
 * ช่องค้นหา = flex-1 เต็มแถว (มี filter เพิ่มค่อยเบียด) · × = ล้าง
 * ช่วงวันที่ = วันเช็คอิน (preset วันนี้/พรุ่งนี้อยู่ใน picker)
 * ทุกการกรอง = navigate ใหม่ (ไม่มี page param → รีเซ็ตหน้า 1 เอง) */
export function BookingsFilterBar({
  s,
  q,
  from,
  to,
  rt,
  roomTypes,
  clearHref,
}: {
  s?: string;
  q?: string;
  from?: string;
  to?: string;
  rt?: string;
  roomTypes: { id: string; name: string }[];
  clearHref: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [qText, setQText] = useState(q ?? "");
  const [range, setRange] = useState<DateRange | null>(
    from && to ? { from, to } : null,
  );
  const [roomType, setRoomType] = useState(rt ?? "");
  const hasFilter = !!(q || from || to || rt);

  // navigate ด้วยค่าปัจจุบัน (override ได้รายตัว) — จุดเดียวของการกรองทั้งแถบ
  const apply = (over?: { q?: string; range?: DateRange | null; rt?: string }) => {
    const nq = over?.q !== undefined ? over.q : qText;
    const nrange = over?.range !== undefined ? over.range : range;
    const nrt = over?.rt !== undefined ? over.rt : roomType;
    const p = new URLSearchParams();
    if (s && s !== "all") p.set("s", s);
    if (nq.trim()) p.set("q", nq.trim());
    if (nrange) {
      p.set("from", nrange.from);
      p.set("to", nrange.to);
    }
    if (nrt) p.set("rt", nrt);
    router.push(`${pathname}?${p.toString()}`);
  };

  // sync กลับเมื่อ URL เปลี่ยนจากทางอื่น (กด back / สลับ tab)
  useEffect(() => setQText(q ?? ""), [q]);
  useEffect(() => {
    setRange(from && to ? { from, to } : null);
  }, [from, to]);
  useEffect(() => setRoomType(rt ?? ""), [rt]);

  // debounce ช่องค้นหา — หยุดพิมพ์ 400ms แล้วกรองเลย
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (qText === (q ?? "")) return; // ตรงกับที่กรองอยู่แล้ว — ไม่ยิงซ้ำ
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => apply({ q: qText }), 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qText]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* เต็มความกว้างที่เหลือของแถว (เจ้าของขอ — มี filter เพิ่มค่อยลด) */}
      <SearchBox
        value={qText}
        onChange={(e) => setQText(e.target.value)}
        placeholder="ค้นหา ชื่อแขก / เบอร์โทร / email / โค้ดจอง — พิมพ์แล้วกรองอัตโนมัติ"
        className="w-full sm:min-w-64 sm:flex-1"
      />

      <DateRangePicker
        mode="range"
        value={range}
        onChange={(d) => {
          setRange(d);
          apply({ range: d }); // เลือกครบช่วงแล้วกรองทันที
        }}
        clearable
        onClear={() => {
          setRange(null);
          apply({ range: null });
        }}
        placeholder="ช่วงวันที่เข้าพัก"
        className="w-full sm:w-80"
      />

      {roomTypes.length > 1 && (
        <Select
          value={roomType}
          onChange={(v) => {
            setRoomType(v);
            apply({ rt: v });
          }}
          placeholder="ทุกประเภทห้อง"
          className="w-full sm:w-44"
          options={[
            { value: "", label: "ทุกประเภทห้อง" },
            ...roomTypes.map((r) => ({ value: r.id, label: r.name })),
          ]}
        />
      )}

      {hasFilter && (
        // ล้างทุกตัวกรอง — ไอคอน × (เจ้าของสั่งใช้แทนคำว่า "ล้าง")
        <button
          type="button"
          onClick={() => router.push(clearHref)}
          aria-label="ล้างตัวกรองทั้งหมด"
          title="ล้างตัวกรองทั้งหมด"
          className="btn btn-ghost btn-sm text-fg-muted"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}
