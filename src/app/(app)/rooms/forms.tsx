"use client";

import { useState } from "react";
import { createRoomType, createRoom } from "./actions";

const field =
  "rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900";

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
      <input
        name="name"
        required
        placeholder="ชื่อ เช่น Deluxe"
        className={`col-span-3 ${field}`}
      />
      <input
        type="number"
        name="base_occupancy"
        defaultValue={2}
        min={1}
        placeholder="พักพื้นฐาน"
        className={field}
        title="occupancy พื้นฐาน"
      />
      <input
        type="number"
        name="max_occupancy"
        defaultValue={2}
        min={1}
        placeholder="พักสูงสุด"
        className={field}
        title="occupancy สูงสุด"
      />
      <input
        type="number"
        name="child_age_limit"
        defaultValue={12}
        placeholder="อายุเด็ก ≤"
        className={field}
        title="เด็กอายุไม่เกิน (ปี)"
      />
      <input
        type="number"
        name="extra_adult"
        defaultValue={0}
        placeholder="ผู้ใหญ่เพิ่ม ฿"
        className={field}
        title="ค่าผู้ใหญ่เพิ่ม (บาท/คน/คืน)"
      />
      <input
        type="number"
        name="extra_child"
        defaultValue={0}
        placeholder="เด็กเพิ่ม ฿"
        className={field}
        title="ค่าเด็กเพิ่ม (บาท/คน/คืน)"
      />
      <button className="rounded-md bg-neutral-900 px-4 text-sm font-medium text-white dark:bg-white dark:text-neutral-900">
        เพิ่มประเภท
      </button>
      {error && <p className="col-span-3 text-sm text-red-600">{error}</p>}
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
      <input name="room_number" required placeholder="เลขห้อง" className={field} />
      <input name="floor" placeholder="ชั้น" className={`w-20 ${field}`} />
      <button className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700">
        + เพิ่มห้อง
      </button>
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </form>
  );
}
