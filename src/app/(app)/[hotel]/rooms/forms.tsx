"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Field, Input, Button, Modal, useToast } from "@/components/ui";
import { createRoomType, createRoom } from "./actions";

// submit + toast + ปิด modal เมื่อสำเร็จ (โยน error ต่อไม่ได้ → toast แทน)
function useSubmit(
  action: (fd: FormData) => Promise<void>,
  successMsg: string,
  onSuccess?: () => void,
) {
  const toast = useToast();
  const [pending, setPending] = useState(false);

  async function onSubmit(fd: FormData) {
    setPending(true);
    try {
      await action(fd);
      toast.ok(successMsg);
      onSuccess?.();
    } catch (e) {
      toast.err(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    } finally {
      setPending(false);
    }
  }
  return { onSubmit, pending };
}

/* ── ประเภทห้อง ────────────────────────────────────────────────────────────── */

// ปุ่ม "เพิ่มประเภทห้อง" → เปิด modal (ใช้ Modal shared component)
export function RoomTypeModalButton({
  hotelSlug,
  propertyId,
  variant = "primary",
  label = "เพิ่มประเภทห้อง",
}: {
  hotelSlug: string;
  propertyId: string;
  variant?: "primary" | "secondary";
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        <Plus size={17} className="mr-1.5" />
        {label}
      </Button>
      <RoomTypeModal
        hotelSlug={hotelSlug}
        propertyId={propertyId}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

function RoomTypeModal({
  hotelSlug,
  propertyId,
  open,
  onClose,
}: {
  hotelSlug: string;
  propertyId: string;
  open: boolean;
  onClose: () => void;
}) {
  const { onSubmit, pending } = useSubmit(
    createRoomType,
    "เพิ่มประเภทห้องแล้ว",
    onClose,
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="เพิ่มประเภทห้อง"
      description="กลุ่มห้องที่ขายราคาเดียวกัน เช่น Deluxe, Superior"
      maxWidth={560}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            ยกเลิก
          </Button>
          <Button type="submit" form="room-type-form" disabled={pending}>
            {pending ? "กำลังบันทึก…" : "เพิ่มประเภทห้อง"}
          </Button>
        </>
      }
    >
      {/* form อยู่ใน body · ปุ่ม submit อยู่ footer → ผูกด้วย form="room-type-form" */}
      <form id="room-type-form" action={onSubmit} className="space-y-4">
        <input type="hidden" name="hotelSlug" value={hotelSlug} />
        <input type="hidden" name="propertyId" value={propertyId} />

        <Field label="ชื่อประเภทห้อง">
          <Input name="name" required placeholder="เช่น Deluxe, Superior, Suite" />
        </Field>

        <div>
          <p className="mb-1.5 text-base font-medium text-fg">จำนวนผู้เข้าพัก</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Field label="พักปกติ (คน)">
              <Input type="number" name="base_occupancy" defaultValue={2} min={1} />
            </Field>
            <Field label="พักได้สูงสุด (คน)">
              <Input type="number" name="max_occupancy" defaultValue={2} min={1} />
            </Field>
            <Field label="เด็กอายุไม่เกิน (ปี)">
              <Input type="number" name="child_age_limit" defaultValue={12} min={0} />
            </Field>
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-base font-medium text-fg">
            ค่าเสริมเมื่อพักเกินจำนวนปกติ{" "}
            <span className="font-normal text-fg-subtle">(บาท/คน/คืน · 0 = ไม่คิด)</span>
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Field label="ผู้ใหญ่เพิ่ม 1 คน">
              <Input type="number" name="extra_adult" defaultValue={0} min={0} />
            </Field>
            <Field label="เด็กเพิ่ม 1 คน">
              <Input type="number" name="extra_child" defaultValue={0} min={0} />
            </Field>
          </div>
        </div>
      </form>
    </Modal>
  );
}

/* ── ห้อง ──────────────────────────────────────────────────────────────────── */

// ปุ่ม "+ เพิ่มห้อง" ต่อประเภทห้อง → เปิด modal
export function RoomModalButton({
  hotelSlug,
  propertyId,
  roomTypeId,
  roomTypeName,
}: {
  hotelSlug: string;
  propertyId: string;
  roomTypeId: string;
  roomTypeName: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Plus size={16} className="mr-1" />
        เพิ่มห้อง
      </Button>
      <RoomModal
        hotelSlug={hotelSlug}
        propertyId={propertyId}
        roomTypeId={roomTypeId}
        roomTypeName={roomTypeName}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

function RoomModal({
  hotelSlug,
  propertyId,
  roomTypeId,
  roomTypeName,
  open,
  onClose,
}: {
  hotelSlug: string;
  propertyId: string;
  roomTypeId: string;
  roomTypeName: string;
  open: boolean;
  onClose: () => void;
}) {
  const { onSubmit, pending } = useSubmit(createRoom, "เพิ่มห้องแล้ว", onClose);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="เพิ่มห้อง"
      description={`ห้องในประเภท "${roomTypeName}"`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            ยกเลิก
          </Button>
          <Button type="submit" form="room-form" disabled={pending}>
            {pending ? "กำลังบันทึก…" : "เพิ่มห้อง"}
          </Button>
        </>
      }
    >
      <form id="room-form" action={onSubmit} className="space-y-4">
        <input type="hidden" name="hotelSlug" value={hotelSlug} />
        <input type="hidden" name="propertyId" value={propertyId} />
        <input type="hidden" name="roomTypeId" value={roomTypeId} />
        <Field label="เลขห้อง">
          <Input name="room_number" required placeholder="เช่น 101" autoFocus />
        </Field>
        <Field label="ชั้น">
          <Input name="floor" placeholder="เช่น 1" />
        </Field>
      </form>
    </Modal>
  );
}
