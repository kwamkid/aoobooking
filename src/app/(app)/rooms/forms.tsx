"use client";

import { Field, Input, Button, useToast } from "@/components/ui";
import { createRoomType, createRoom } from "./actions";

function useSubmit(action: (fd: FormData) => Promise<void>, successMsg: string) {
  const toast = useToast();
  async function onSubmit(fd: FormData) {
    try {
      await action(fd);
      toast.ok(successMsg);
    } catch (e) {
      toast.err(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    }
  }
  return { onSubmit };
}

export function RoomTypeForm({
  hotelSlug,
  propertyId,
}: {
  hotelSlug: string;
  propertyId: string;
}) {
  const { onSubmit } = useSubmit(createRoomType, "เพิ่มประเภทห้องแล้ว");
  return (
    <form action={onSubmit} className="max-w-2xl space-y-4">
      <input type="hidden" name="hotelSlug" value={hotelSlug} />
      <input type="hidden" name="propertyId" value={propertyId} />

      <Field label="ชื่อประเภทห้อง">
        <Input name="name" required placeholder="เช่น Deluxe, Superior, Suite" />
      </Field>

      {/* จำนวนผู้เข้าพัก */}
      <div>
        <p className="mb-1.5 text-sm font-medium text-fg">จำนวนผู้เข้าพัก</p>
        <div className="grid grid-cols-3 gap-2">
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

      {/* ค่าเข้าพักเกินจำนวนปกติ */}
      <div>
        <p className="mb-1.5 text-sm font-medium text-fg">
          ค่าเสริมเมื่อพักเกินจำนวนปกติ{" "}
          <span className="font-normal text-fg-subtle">(บาท/คน/คืน · 0 = ไม่คิด)</span>
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Field label="ผู้ใหญ่เพิ่ม 1 คน">
            <Input type="number" name="extra_adult" defaultValue={0} min={0} />
          </Field>
          <Field label="เด็กเพิ่ม 1 คน">
            <Input type="number" name="extra_child" defaultValue={0} min={0} />
          </Field>
        </div>
      </div>

      <Button type="submit">เพิ่มประเภทห้อง</Button>
    </form>
  );
}

export function RoomForm({
  hotelSlug,
  propertyId,
  roomTypeId,
}: {
  hotelSlug: string;
  propertyId: string;
  roomTypeId: string;
}) {
  const { onSubmit } = useSubmit(createRoom, "เพิ่มห้องแล้ว");
  return (
    <form action={onSubmit} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="hotelSlug" value={hotelSlug} />
      <input type="hidden" name="propertyId" value={propertyId} />
      <input type="hidden" name="roomTypeId" value={roomTypeId} />
      <Field label="เลขห้อง">
        <Input name="room_number" required placeholder="เช่น 101" className="w-32" />
      </Field>
      <Field label="ชั้น">
        <Input name="floor" placeholder="เช่น 1" className="w-24" />
      </Field>
      <Button type="submit" variant="secondary">
        + เพิ่มห้อง
      </Button>
    </form>
  );
}
