"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal, Button, Badge, useToast } from "@/components/ui";
import { isNextControlFlowError } from "@/lib/next-error";
import {
  checkInBooking,
  getCheckInRooms,
  type CheckInInfo,
  type CheckInRoom,
} from "../front-desk/actions";

/* Check-in modal — จอง = ประเภทห้อง · เช็คอิน = เลือกเบอร์ห้องจริงให้แขก
 * กริดเบอร์ห้อง + สถานะแม่บ้าน · จองหลายห้อง = จิ้มหลายเบอร์ตามจำนวน
 * ไม่มีห้องให้เลือกเลย (ยังไม่ตั้งเบอร์ห้อง) = เช็คอินแบบไม่ระบุห้องได้ */

const HK_TH: Record<CheckInRoom["housekeeping"], { label: string; tone: "success" | "warning" | "info" | "danger" }> = {
  clean: { label: "สะอาด", tone: "success" },
  inspected: { label: "ตรวจแล้ว", tone: "info" },
  dirty: { label: "ยังไม่เก็บ", tone: "warning" },
  out_of_order: { label: "งดใช้", tone: "danger" },
};
const UNAVAIL_TH: Record<NonNullable<CheckInRoom["unavailable"]>, string> = {
  occupied: "มีแขกพัก",
  blocked: "ถูกปิดไว้",
  out_of_order: "งดใช้",
};

export function CheckInModal({
  open,
  onClose,
  hotelSlug,
  bookingId,
  code,
  guestName,
}: {
  open: boolean;
  onClose: () => void;
  hotelSlug: string;
  bookingId: string;
  code: string;
  guestName: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [info, setInfo] = useState<CheckInInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  // filter ชั้น — null = ทุกชั้น (โชว์เมื่อมี >1 ชั้น)
  const [floorFilter, setFloorFilter] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getCheckInRooms(hotelSlug, bookingId);
      setInfo(data);
      // หลายชั้น = default ชั้นแรก (ลิสต์สั้น ไม่ท่วม modal) — กด "ทุกชั้น" เองได้
      const fls = [...new Set(data.rooms.map((r) => r.floor ?? ""))];
      setFloorFilter(
        fls.length > 1
          ? fls.sort((a, z) => Number(a) - Number(z) || a.localeCompare(z, "th"))[0]
          : null,
      );
    } catch (e) {
      if (isNextControlFlowError(e)) throw e;
      toast.err(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
    // toast จาก provider — อ้างอิงคงที่
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotelSlug, bookingId]);

  useEffect(() => {
    if (open) {
      setSelected([]);
      load();
    } else {
      setInfo(null);
    }
  }, [open, load]);

  const need = info?.bookingRoomIds.length ?? 1;
  const selectable = info?.rooms.filter((r) => !r.unavailable) ?? [];

  // ชั้น (เรียงเลข) + จำนวนห้องว่างต่อชั้น — filter โชว์เมื่อมี >1 ชั้น
  const floors = [...new Set((info?.rooms ?? []).map((r) => r.floor ?? ""))].sort(
    (a, z) => Number(a) - Number(z) || a.localeCompare(z, "th"),
  );
  const freeCount = (floor: string | null) =>
    selectable.filter((r) => floor === null || (r.floor ?? "") === floor).length;
  const visibleRooms = (info?.rooms ?? []).filter(
    (r) => floorFilter === null || (r.floor ?? "") === floorFilter,
  );

  function toggleRoom(id: string) {
    setSelected((s) => {
      if (s.includes(id)) return s.filter((x) => x !== id);
      // จองห้องเดียว = เลือกใหม่แทนที่เดิม · หลายห้อง = สะสมจนครบจำนวน
      if (need === 1) return [id];
      return s.length < need ? [...s, id] : s;
    });
  }

  async function onCheckIn() {
    if (!info) return;
    setBusy(true);
    try {
      const assignments = selected.map((roomId, i) => ({
        booking_room_id: info.bookingRoomIds[i],
        room_id: roomId,
      }));
      const fd = new FormData();
      fd.set("hotelSlug", hotelSlug);
      fd.set("bookingId", bookingId);
      fd.set("assignments", JSON.stringify(assignments));
      await checkInBooking(fd);
      const roomNos = info.rooms
        .filter((r) => selected.includes(r.id))
        .map((r) => r.room_number)
        .join(", ");
      toast.ok(roomNos ? `เช็คอิน ${code} เข้าห้อง ${roomNos} แล้ว` : `เช็คอิน ${code} แล้ว`);
      onClose();
      router.refresh();
    } catch (e) {
      if (isNextControlFlowError(e)) throw e;
      toast.err(e instanceof Error ? e.message : "เช็คอินไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      // แบ่งซ้าย-ขวา: ซ้าย = เช็คอิน+โค้ด · ขวา = เลือกห้องประเภทไหน (เจ้าของขอ)
      title={
        <span className="flex w-full items-baseline justify-between gap-3">
          <span>เช็คอิน · {code}</span>
          {info && (
            <span className="shrink-0 text-base font-medium text-fg-muted">
              เลือกห้อง {info.roomTypeName}
              {need > 1 && ` (${selected.length}/${need})`}
            </span>
          )}
        </span>
      }
      description={guestName ?? undefined}
      maxWidth={560}
    >
      {loading || !info ? (
        <p className="py-8 text-center text-base text-fg-muted">กำลังโหลด…</p>
      ) : (
        <div className="space-y-4">
          {/* filter ชั้น + จำนวนห้องว่างต่อชั้น (เจ้าของขอ 2026-07-22) */}
          {floors.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setFloorFilter(null)}
                className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                  floorFilter === null
                    ? "border-brand bg-brand-soft text-brand-strong"
                    : "border-border text-fg-muted hover:border-brand"
                }`}
              >
                ทุกชั้น ({freeCount(null)})
              </button>
              {floors.map((f) => (
                <button
                  key={f || "-"}
                  type="button"
                  onClick={() => setFloorFilter(f)}
                  className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                    floorFilter === f
                      ? "border-brand bg-brand-soft text-brand-strong"
                      : "border-border text-fg-muted hover:border-brand"
                  }`}
                >
                  {f ? `ชั้น ${f}` : "ไม่ระบุชั้น"} ({freeCount(f)})
                </button>
              ))}
            </div>
          )}

          {info.rooms.length === 0 ? (
            <p className="rounded-md bg-warning-soft p-3 text-base text-warning-strong">
              ประเภทนี้ยังไม่ได้ตั้งเบอร์ห้อง — เช็คอินแบบไม่ระบุห้องได้ แต่แนะนำไปเพิ่มห้องที่หน้า
              ห้องพัก
            </p>
          ) : (
            /* กริด scroll ในตัวเอง — ห้องเยอะแค่ไหน modal ไม่ล้นจอ ปุ่มยืนยันอยู่ล่างตลอด */
            <div className="grid max-h-[45vh] grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-4">
              {visibleRooms.map((r) => {
                const hk = HK_TH[r.housekeeping];
                const isSelected = selected.includes(r.id);
                const disabled = !!r.unavailable;
                return (
                  <button
                    key={r.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => toggleRoom(r.id)}
                    className={`flex flex-col items-center gap-1 rounded-lg border p-2.5 transition-colors ${
                      isSelected
                        ? "border-brand bg-brand-soft"
                        : disabled
                          ? "cursor-not-allowed border-border bg-bg-subtle opacity-60"
                          : "border-border bg-bg-elevated hover:border-brand"
                    }`}
                  >
                    <span
                      className={`text-lg font-semibold tabular-nums ${
                        isSelected ? "text-brand-strong" : "text-fg"
                      }`}
                    >
                      {r.room_number}
                    </span>
                    <Badge tone={r.unavailable ? "neutral" : hk.tone}>
                      {r.unavailable ? UNAVAIL_TH[r.unavailable] : hk.label}
                    </Badge>
                  </button>
                );
              })}
            </div>
          )}

          {/* เลือกห้อง "ยังไม่เก็บ" ได้ แต่เตือนให้รู้ตัว */}
          {info.rooms.some((r) => selected.includes(r.id) && r.housekeeping === "dirty") && (
            <p className="text-sm text-warning-strong">
              ห้องที่เลือกยังไม่ได้ทำความสะอาด — แจ้งแม่บ้านก่อนพาแขกขึ้นห้อง
            </p>
          )}

          <Button
            className="w-full"
            disabled={
              busy || (info.rooms.length > 0 && (selected.length < need || selectable.length === 0))
            }
            onClick={onCheckIn}
          >
            {busy
              ? "กำลังเช็คอิน…"
              : info.rooms.length === 0
                ? "เช็คอิน (ไม่ระบุห้อง)"
                : selected.length < need
                  ? `เลือกห้องอีก ${need - selected.length} ห้อง`
                  : "ยืนยันเช็คอิน"}
          </Button>
        </div>
      )}
    </Modal>
  );
}
