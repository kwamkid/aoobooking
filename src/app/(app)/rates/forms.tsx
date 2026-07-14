"use client";

import { useState } from "react";
import { createRatePlan, setBulkPrices } from "./actions";

const field =
  "rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900";
const label = "mb-1 block text-xs font-medium text-neutral-500";

function useSubmit(action: (fd: FormData) => Promise<void>) {
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  async function onSubmit(fd: FormData) {
    setError(null);
    setOk(false);
    try {
      await action(fd);
      setOk(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    }
  }
  return { onSubmit, error, ok };
}

export function RatePlanForm({
  hotelSlug,
  propertyId,
}: {
  hotelSlug: string;
  propertyId: string;
}) {
  const { onSubmit, error } = useSubmit(createRatePlan);
  const [depType, setDepType] = useState("none");
  const [cancelType, setCancelType] = useState("free_until");

  return (
    <form action={onSubmit} className="grid max-w-2xl grid-cols-2 gap-3">
      <input type="hidden" name="hotelSlug" value={hotelSlug} />
      <input type="hidden" name="propertyId" value={propertyId} />

      <div className="col-span-2">
        <label className={label}>ชื่อ rate plan *</label>
        <input name="name" required placeholder="เช่น Flexible" className={`w-full ${field}`} />
      </div>

      <div>
        <label className={label}>มัดจำ</label>
        <select
          name="deposit_type"
          value={depType}
          onChange={(e) => setDepType(e.target.value)}
          className={`w-full ${field}`}
        >
          <option value="none">ไม่เก็บ (จ่ายที่โรงแรม)</option>
          <option value="first_night">คืนแรก</option>
          <option value="percent">เปอร์เซ็นต์</option>
          <option value="fixed">จำนวนเงินคงที่</option>
          <option value="full">เต็มจำนวน</option>
        </select>
      </div>
      <div>
        <label className={label}>
          {depType === "percent" ? "%" : depType === "fixed" ? "บาท" : "—"}
        </label>
        <input
          type="number"
          name="deposit_value"
          disabled={depType !== "percent" && depType !== "fixed"}
          defaultValue={0}
          className={`w-full ${field} disabled:opacity-40`}
        />
      </div>

      <div>
        <label className={label}>นโยบายยกเลิก</label>
        <select
          name="cancel_type"
          value={cancelType}
          onChange={(e) => setCancelType(e.target.value)}
          className={`w-full ${field}`}
        >
          <option value="free_until">ฟรีก่อน N วัน</option>
          <option value="non_refundable">ไม่คืนเงิน</option>
        </select>
      </div>
      <div>
        <label className={label}>ยกเลิกฟรีก่อน (วัน)</label>
        <input
          type="number"
          name="cancel_days"
          disabled={cancelType !== "free_until"}
          defaultValue={1}
          className={`w-full ${field} disabled:opacity-40`}
        />
      </div>

      <label className="col-span-2 flex items-center gap-2 text-sm">
        <input type="checkbox" name="include_breakfast" /> รวมอาหารเช้า
      </label>

      {error && <p className="col-span-2 text-sm text-red-600">{error}</p>}
      <div className="col-span-2">
        <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-neutral-900">
          เพิ่ม rate plan
        </button>
      </div>
    </form>
  );
}

export function BulkPriceForm({
  hotelSlug,
  ratePlans,
  roomTypes,
}: {
  hotelSlug: string;
  ratePlans: { id: string; name: string }[];
  roomTypes: { id: string; name: string }[];
}) {
  const { onSubmit, error, ok } = useSubmit(setBulkPrices);
  return (
    <form action={onSubmit} className="grid max-w-2xl grid-cols-2 gap-3">
      <input type="hidden" name="hotelSlug" value={hotelSlug} />

      <div>
        <label className={label}>Rate plan</label>
        <select name="ratePlanId" className={`w-full ${field}`}>
          {ratePlans.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={label}>ประเภทห้อง</label>
        <select name="roomTypeId" className={`w-full ${field}`}>
          {roomTypes.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={label}>ตั้งแต่วันที่</label>
        <input type="date" name="from" required className={`w-full ${field}`} />
      </div>
      <div>
        <label className={label}>ถึงวันที่</label>
        <input type="date" name="to" required className={`w-full ${field}`} />
      </div>

      <div>
        <label className={label}>ราคา/คืน (บาท)</label>
        <input type="number" name="price" required min={0} className={`w-full ${field}`} />
      </div>
      <div>
        <label className={label}>ขั้นต่ำ (คืน)</label>
        <input type="number" name="min_stay" defaultValue={1} min={1} className={`w-full ${field}`} />
      </div>

      {error && <p className="col-span-2 text-sm text-red-600">{error}</p>}
      {ok && <p className="col-span-2 text-sm text-green-600">ตั้งราคาเรียบร้อย</p>}
      <div className="col-span-2">
        <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-neutral-900">
          ตั้งราคาทั้งช่วง
        </button>
      </div>
    </form>
  );
}
