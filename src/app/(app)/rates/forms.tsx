"use client";

import { useState } from "react";
import { Field, Input, Select, Button, useToast } from "@/components/ui";
import { createRatePlan, setBulkPrices } from "./actions";

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

export function RatePlanForm({
  hotelSlug,
  propertyId,
}: {
  hotelSlug: string;
  propertyId: string;
}) {
  const { onSubmit } = useSubmit(createRatePlan, "เพิ่ม rate plan แล้ว");
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
          onChange={setDepType}
          className="w-full"
          options={[
            { value: "none", label: "ไม่เก็บ (จ่ายที่โรงแรม)" },
            { value: "first_night", label: "คืนแรก" },
            { value: "percent", label: "เปอร์เซ็นต์" },
            { value: "fixed", label: "จำนวนเงินคงที่" },
            { value: "full", label: "เต็มจำนวน" },
          ]}
        />
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
          onChange={setCancelType}
          className="w-full"
          options={[
            { value: "free_until", label: "ฟรีก่อน N วัน" },
            { value: "non_refundable", label: "ไม่คืนเงิน" },
          ]}
        />
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
  const { onSubmit } = useSubmit(setBulkPrices, "ตั้งราคาเรียบร้อย");
  return (
    <form action={onSubmit} className="grid max-w-2xl grid-cols-2 gap-3">
      <input type="hidden" name="hotelSlug" value={hotelSlug} />

      <Field label="Rate plan">
        <Select
          name="ratePlanId"
          className="w-full"
          defaultValue={ratePlans[0]?.id ?? ""}
          options={ratePlans.map((r) => ({ value: r.id, label: r.name }))}
        />
      </Field>
      <Field label="ประเภทห้อง">
        <Select
          name="roomTypeId"
          className="w-full"
          defaultValue={roomTypes[0]?.id ?? ""}
          options={roomTypes.map((r) => ({ value: r.id, label: r.name }))}
        />
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

      <div className="col-span-2">
        <Button type="submit">ตั้งราคาทั้งช่วง</Button>
      </div>
    </form>
  );
}
