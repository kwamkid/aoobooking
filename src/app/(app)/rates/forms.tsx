"use client";

import { useState } from "react";
import { Field, Input, Select, Button } from "@/components/ui";
import { createRatePlan, setBulkPrices } from "./actions";

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

      <Field label="ชื่อ rate plan *" className="col-span-2">
        <Input name="name" required placeholder="เช่น Flexible" className="w-full" />
      </Field>

      <Field label="มัดจำ">
        <Select
          name="deposit_type"
          value={depType}
          onChange={(e) => setDepType(e.target.value)}
          className="w-full"
        >
          <option value="none">ไม่เก็บ (จ่ายที่โรงแรม)</option>
          <option value="first_night">คืนแรก</option>
          <option value="percent">เปอร์เซ็นต์</option>
          <option value="fixed">จำนวนเงินคงที่</option>
          <option value="full">เต็มจำนวน</option>
        </Select>
      </Field>
      <Field label={depType === "percent" ? "%" : depType === "fixed" ? "บาท" : "—"}>
        <Input
          type="number"
          name="deposit_value"
          disabled={depType !== "percent" && depType !== "fixed"}
          defaultValue={0}
          className="w-full disabled:opacity-40"
        />
      </Field>

      <Field label="นโยบายยกเลิก">
        <Select
          name="cancel_type"
          value={cancelType}
          onChange={(e) => setCancelType(e.target.value)}
          className="w-full"
        >
          <option value="free_until">ฟรีก่อน N วัน</option>
          <option value="non_refundable">ไม่คืนเงิน</option>
        </Select>
      </Field>
      <Field label="ยกเลิกฟรีก่อน (วัน)">
        <Input
          type="number"
          name="cancel_days"
          disabled={cancelType !== "free_until"}
          defaultValue={1}
          className="w-full disabled:opacity-40"
        />
      </Field>

      <label className="col-span-2 flex items-center gap-2 text-sm text-fg">
        <input type="checkbox" name="include_breakfast" /> รวมอาหารเช้า
      </label>

      {error && <p className="col-span-2 text-sm text-danger">{error}</p>}
      <div className="col-span-2">
        <Button type="submit">เพิ่ม rate plan</Button>
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

      <Field label="Rate plan">
        <Select name="ratePlanId" className="w-full">
          {ratePlans.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="ประเภทห้อง">
        <Select name="roomTypeId" className="w-full">
          {roomTypes.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="ตั้งแต่วันที่">
        <Input type="date" name="from" required className="w-full" />
      </Field>
      <Field label="ถึงวันที่">
        <Input type="date" name="to" required className="w-full" />
      </Field>

      <Field label="ราคา/คืน (บาท)">
        <Input type="number" name="price" required min={0} className="w-full" />
      </Field>
      <Field label="ขั้นต่ำ (คืน)">
        <Input type="number" name="min_stay" defaultValue={1} min={1} className="w-full" />
      </Field>

      {error && <p className="col-span-2 text-sm text-danger">{error}</p>}
      {ok && <p className="col-span-2 text-sm text-success">ตั้งราคาเรียบร้อย</p>}
      <div className="col-span-2">
        <Button type="submit">ตั้งราคาทั้งช่วง</Button>
      </div>
    </form>
  );
}
