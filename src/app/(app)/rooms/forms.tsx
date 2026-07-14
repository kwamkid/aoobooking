"use client";

import { useState } from "react";
import { Field, Input, Button } from "@/components/ui";
import { createRoomType, createRoom } from "./actions";

function useSubmit(action: (fd: FormData) => Promise<void>) {
  const [error, setError] = useState<string | null>(null);
  async function onSubmit(fd: FormData) {
    setError(null);
    try {
      await action(fd);
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    }
  }
  return { onSubmit, error };
}

export function RoomTypeForm({
  hotelSlug,
  propertyId,
}: {
  hotelSlug: string;
  propertyId: string;
}) {
  const { onSubmit, error } = useSubmit(createRoomType);
  return (
    <form action={onSubmit} className="grid max-w-2xl grid-cols-3 gap-2">
      <input type="hidden" name="hotelSlug" value={hotelSlug} />
      <input type="hidden" name="propertyId" value={propertyId} />
      <Field className="col-span-3">
        <Input name="name" required placeholder="ชื่อ เช่น Deluxe" />
      </Field>
      <Input
        type="number"
        name="base_occupancy"
        defaultValue={2}
        min={1}
        placeholder="พักพื้นฐาน"
        title="occupancy พื้นฐาน"
      />
      <Input
        type="number"
        name="max_occupancy"
        defaultValue={2}
        min={1}
        placeholder="พักสูงสุด"
        title="occupancy สูงสุด"
      />
      <Input
        type="number"
        name="child_age_limit"
        defaultValue={12}
        placeholder="อายุเด็ก ≤"
        title="เด็กอายุไม่เกิน (ปี)"
      />
      <Input
        type="number"
        name="extra_adult"
        defaultValue={0}
        placeholder="ผู้ใหญ่เพิ่ม ฿"
        title="ค่าผู้ใหญ่เพิ่ม (บาท/คน/คืน)"
      />
      <Input
        type="number"
        name="extra_child"
        defaultValue={0}
        placeholder="เด็กเพิ่ม ฿"
        title="ค่าเด็กเพิ่ม (บาท/คน/คืน)"
      />
      <Button type="submit">เพิ่มประเภท</Button>
      {error && <p className="col-span-3 text-sm text-danger">{error}</p>}
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
  const { onSubmit, error } = useSubmit(createRoom);
  return (
    <form action={onSubmit} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="hotelSlug" value={hotelSlug} />
      <input type="hidden" name="propertyId" value={propertyId} />
      <input type="hidden" name="roomTypeId" value={roomTypeId} />
      <Input name="room_number" required placeholder="เลขห้อง" />
      <Input name="floor" placeholder="ชั้น" className="w-20" />
      <Button type="submit" variant="secondary">
        + เพิ่มห้อง
      </Button>
      {error && <p className="w-full text-sm text-danger">{error}</p>}
    </form>
  );
}
