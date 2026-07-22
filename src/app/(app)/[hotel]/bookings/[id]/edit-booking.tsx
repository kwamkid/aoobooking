"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Modal,
  Field,
  Select,
  Button,
  DateRangePicker,
  type DateRange,
  useToast,
} from "@/components/ui";
import { isNextControlFlowError } from "@/lib/next-error";
import {
  changeBookingDates,
  changeBookingRoomType,
  type RepriceResult,
} from "./actions";

/* แก้การจอง — เลื่อนวันเข้าพัก / ย้ายประเภทห้อง (devplan ข้อ 3)
 * RPC คิดราคาใหม่ + กัน overbooking ใน transaction · toast บอกยอดเปลี่ยนชัดๆ */

function baht(satang: number): string {
  return (satang / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 });
}

function diffMessage(prefix: string, r: RepriceResult): string {
  if (r.diffSatang === 0) return `${prefix} — ยอดเท่าเดิม ${baht(r.newTotalSatang)}฿`;
  const dir = r.diffSatang > 0 ? "เพิ่มขึ้น" : "ลดลง";
  return `${prefix} — ยอดใหม่ ${baht(r.newTotalSatang)}฿ (${dir} ${baht(Math.abs(r.diffSatang))})`;
}

export function EditBookingButtons({
  hotelSlug,
  bookingId,
  status,
  checkIn,
  checkOut,
  roomTypeId,
  roomTypes,
  canChangeDate,
  canMoveRoom,
}: {
  hotelSlug: string;
  bookingId: string;
  status: string;
  checkIn: string;
  checkOut: string;
  roomTypeId: string | null;
  roomTypes: { id: string; name: string }[];
  canChangeDate: boolean;
  canMoveRoom: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [datesOpen, setDatesOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [range, setRange] = useState<DateRange>({ from: checkIn, to: checkOut });
  const [newType, setNewType] = useState("");

  // เลื่อนวัน: pending/confirmed เปลี่ยนได้หมด · checked_in เปลี่ยนได้เฉพาะวันออก
  const showDates =
    canChangeDate && ["pending", "confirmed", "checked_in"].includes(status);
  // ย้ายประเภทห้อง: ก่อนเช็คอิน + มีประเภทอื่นให้ย้าย
  const otherTypes = roomTypes.filter((t) => t.id !== roomTypeId);
  const showMove =
    canMoveRoom && ["pending", "confirmed"].includes(status) && otherTypes.length > 0;

  if (!showDates && !showMove) return null;

  async function onChangeDates() {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("hotelSlug", hotelSlug);
      fd.set("bookingId", bookingId);
      fd.set("checkIn", range.from);
      fd.set("checkOut", range.to);
      const r = await changeBookingDates(fd);
      toast.ok(diffMessage("เลื่อนวันแล้ว", r));
      setDatesOpen(false);
      router.refresh();
    } catch (e) {
      if (isNextControlFlowError(e)) throw e;
      toast.err(e instanceof Error ? e.message : "เลื่อนวันไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function onMove() {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("hotelSlug", hotelSlug);
      fd.set("bookingId", bookingId);
      fd.set("roomTypeId", newType);
      const r = await changeBookingRoomType(fd);
      toast.ok(diffMessage("ย้ายประเภทห้องแล้ว", r));
      setMoveOpen(false);
      router.refresh();
    } catch (e) {
      if (isNextControlFlowError(e)) throw e;
      toast.err(e instanceof Error ? e.message : "ย้ายห้องไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {showDates && (
        <Button
          variant="secondary"
          onClick={() => {
            setRange({ from: checkIn, to: checkOut });
            setDatesOpen(true);
          }}
        >
          เลื่อนวัน
        </Button>
      )}
      {showMove && (
        <Button
          variant="secondary"
          onClick={() => {
            setNewType("");
            setMoveOpen(true);
          }}
        >
          ย้ายห้อง
        </Button>
      )}

      <Modal
        open={datesOpen}
        onClose={() => setDatesOpen(false)}
        title="เลื่อนวันเข้าพัก"
        description={
          status === "checked_in"
            ? "แขกเช็คอินแล้ว — เปลี่ยนได้เฉพาะวันเช็คเอาท์ (ขยาย/ลดวันพัก)"
            : "ระบบเช็คห้องว่าง + คิดราคาใหม่ตามช่วงวันให้อัตโนมัติ"
        }
      >
        <div className="space-y-3">
          <Field label="วันเข้าพักใหม่">
            <DateRangePicker
              mode="range"
              value={range}
              onChange={setRange}
              className="w-full"
            />
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setDatesOpen(false)}>
              ยกเลิก
            </Button>
            <Button
              disabled={busy || (range.from === checkIn && range.to === checkOut)}
              onClick={onChangeDates}
            >
              {busy ? "กำลังบันทึก…" : "ยืนยันเลื่อนวัน"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={moveOpen}
        onClose={() => setMoveOpen(false)}
        title="ย้ายประเภทห้อง"
        description="แพ็กเกจราคาเดิม — ระบบเช็คห้องว่าง + คิดราคาใหม่ตามประเภทปลายทาง"
      >
        <div className="space-y-3">
          <Field label="ประเภทห้องใหม่">
            <Select
              value={newType}
              onChange={setNewType}
              options={otherTypes.map((t) => ({ value: t.id, label: t.name }))}
              placeholder="— เลือกประเภทห้อง —"
              className="w-full"
            />
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setMoveOpen(false)}>
              ยกเลิก
            </Button>
            <Button disabled={busy || !newType} onClick={onMove}>
              {busy ? "กำลังบันทึก…" : "ยืนยันย้ายห้อง"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
