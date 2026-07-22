"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import {
  Field,
  Input,
  Select,
  Button,
  Modal,
  DateRangePicker,
  toIsoDate,
  useToast,
} from "@/components/ui";
import { isNextControlFlowError } from "@/lib/next-error";
import { createTenancy } from "./actions";

/* modal สร้างสัญญาเช่ารายเดือน — เลือกห้องว่าง (เฉพาะประเภทที่เปิดรายเดือน)
 * ค่าเช่า default จากประเภทห้อง · มัดจำ default = เดือนตั้งค่าสาขา × ค่าเช่า */

export type RentableRoom = {
  id: string;
  label: string; // "101 · Deluxe"
  rentBaht: number; // ราคาเช่าประเภทห้อง (บาท/เดือน)
};

export function AddTenancyButton({
  hotelSlug,
  rooms,
  depositMonths,
}: {
  hotelSlug: string;
  rooms: RentableRoom[];
  depositMonths: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus size={16} className="mr-1.5" />
        เพิ่มผู้เช่า
      </Button>
      {open && (
        <AddTenancyModal
          hotelSlug={hotelSlug}
          rooms={rooms}
          depositMonths={depositMonths}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function AddTenancyModal({
  hotelSlug,
  rooms,
  depositMonths,
  onClose,
}: {
  hotelSlug: string;
  rooms: RentableRoom[];
  depositMonths: number;
  onClose: () => void;
}) {
  const toast = useToast();
  const [pending, setPending] = useState(false);

  const [roomId, setRoomId] = useState("");
  const [startDate, setStartDate] = useState<string | null>(() => toIsoDate(new Date()));
  const [rent, setRent] = useState("");
  const [deposit, setDeposit] = useState("");

  const selected = useMemo(() => rooms.find((r) => r.id === roomId), [rooms, roomId]);

  // เลือกห้อง → เติมค่าเช่า + มัดจำ default ให้ (แก้ทับได้)
  const onPickRoom = (id: string) => {
    setRoomId(id);
    const r = rooms.find((x) => x.id === id);
    if (r) {
      setRent(String(r.rentBaht));
      setDeposit(String(r.rentBaht * depositMonths));
    }
  };

  const valid = !!roomId && !!startDate && Number(rent) > 0;

  async function onSubmit(fd: FormData) {
    setPending(true);
    try {
      await createTenancy(fd);
      toast.ok("สร้างสัญญาเช่าแล้ว — ห้องถูกกันออกจากการขายรายวันให้เอง");
      onClose();
    } catch (e) {
      if (isNextControlFlowError(e)) throw e;
      toast.err(e instanceof Error ? e.message : "สร้างสัญญาไม่สำเร็จ");
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="เพิ่มผู้เช่ารายเดือน"
      description="ห้องที่มีผู้เช่าจะถูกกันออกจากการขายรายวันอัตโนมัติ · บิลเก็บทุกวันที่ 1 (เดือนแรกคิดตามวันจริง — ระบบบิลกำลังตามมา)"
      maxWidth={520}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            ยกเลิก
          </Button>
          <Button type="submit" form="tenancy-form" disabled={pending || !valid}>
            {pending ? "กำลังบันทึก…" : "สร้างสัญญาเช่า"}
          </Button>
        </>
      }
    >
      <form id="tenancy-form" action={onSubmit} className="space-y-4">
        <input type="hidden" name="hotelSlug" value={hotelSlug} />
        <input type="hidden" name="roomId" value={roomId} />
        <input type="hidden" name="startDate" value={startDate ?? ""} />

        <Field
          label="ห้อง"
          hint={
            rooms.length === 0 ? (
              <>
                ยังไม่มีห้องที่ปล่อยเช่าได้ — ไปที่ <strong className="text-fg">ห้องพัก</strong>{" "}
                แก้ไขประเภทห้อง แล้วใส่ &quot;ราคาเช่ารายเดือน&quot; ก่อน
              </>
            ) : (
              <>เฉพาะห้องว่างของประเภทที่ตั้งราคาเช่ารายเดือนไว้</>
            )
          }
        >
          <Select
            value={roomId}
            onChange={onPickRoom}
            placeholder={rooms.length === 0 ? "ไม่มีห้องที่ปล่อยเช่าได้" : "— เลือกห้อง —"}
            className="w-full"
            options={rooms.map((r) => ({
              value: r.id,
              label: `${r.label} · ${r.rentBaht.toLocaleString()}฿/เดือน`,
            }))}
          />
        </Field>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Field label="ผู้เช่า (ชื่อ)">
            <Input name="guestName" required placeholder="ชื่อ-นามสกุล" />
          </Field>
          <Field label="เบอร์โทร">
            <Input name="guestPhone" placeholder="08x-xxx-xxxx" />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Field label="เริ่มสัญญา">
            <DateRangePicker
              mode="single"
              value={startDate}
              onChange={setStartDate}
              className="w-full"
            />
          </Field>
          <Field label="ค่าเช่า (บาท/เดือน)">
            <Input
              type="number"
              name="rent"
              min={0}
              required
              value={rent}
              onChange={(e) => setRent(e.target.value)}
              className="text-right tabular-nums"
            />
          </Field>
          <Field
            label="เงินมัดจำ (บาท)"
            hint={
              <>
                ค่าเริ่มต้น = {depositMonths} เดือน × ค่าเช่า (ตั้งได้ที่ ตั้งค่า &gt;
                โรงแรม) · คืนตอนย้ายออก
              </>
            }
          >
            <Input
              type="number"
              name="deposit"
              min={0}
              value={deposit}
              onChange={(e) => setDeposit(e.target.value)}
              className="text-right tabular-nums"
            />
          </Field>
        </div>

        {selected && Number(rent) > 0 && (
          <p className="rounded-(--radius) bg-brand-soft/40 px-3 py-2.5 text-base text-fg">
            ห้อง {selected.label} · เช่า{" "}
            <strong className="tabular-nums">{Number(rent).toLocaleString()}฿/เดือน</strong>
            {Number(deposit) > 0 && (
              <>
                {" "}
                · มัดจำ{" "}
                <strong className="tabular-nums">
                  {Number(deposit).toLocaleString()}฿
                </strong>
              </>
            )}
          </p>
        )}
      </form>
    </Modal>
  );
}
