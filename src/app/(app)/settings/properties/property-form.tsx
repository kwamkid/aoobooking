"use client";

import { useState } from "react";
import { createProperty, updateProperty } from "./actions";

type Property = {
  id: string;
  slug: string;
  name: string;
  address: string | null;
  phone: string | null;
  timezone: string;
  check_in_time: string;
  check_out_time: string;
  vat_percent: number;
  service_charge_percent: number;
  tax_inclusive: boolean;
};

const field =
  "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900";
const label = "mb-1 block text-xs font-medium text-neutral-500";

export function PropertyForm({
  hotelSlug,
  property,
}: {
  hotelSlug: string;
  property?: Property;
}) {
  const isEdit = !!property;
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(fd: FormData) {
    setError(null);
    try {
      if (isEdit) await updateProperty(fd);
      else await createProperty(fd);
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    }
  }

  return (
    <form action={onSubmit} className="grid grid-cols-2 gap-3">
      <input type="hidden" name="hotelSlug" value={hotelSlug} />
      {isEdit && <input type="hidden" name="propertyId" value={property.id} />}

      <div className="col-span-2">
        <label className={label}>ชื่อสาขา *</label>
        <input name="name" required defaultValue={property?.name} className={field} />
      </div>

      {!isEdit && (
        <div className="col-span-2">
          <label className={label}>slug (URL — เว้นว่างให้ระบบสร้างจากชื่อ)</label>
          <input name="slug" placeholder="phuket" className={field} />
        </div>
      )}

      <div className="col-span-2">
        <label className={label}>ที่อยู่</label>
        <input name="address" defaultValue={property?.address ?? ""} className={field} />
      </div>

      <div>
        <label className={label}>โทรศัพท์</label>
        <input name="phone" defaultValue={property?.phone ?? ""} className={field} />
      </div>
      <div>
        <label className={label}>Timezone</label>
        <input
          name="timezone"
          defaultValue={property?.timezone ?? "Asia/Bangkok"}
          className={field}
        />
      </div>

      <div>
        <label className={label}>เวลาเช็คอิน</label>
        <input
          type="time"
          name="check_in_time"
          defaultValue={property?.check_in_time ?? "14:00"}
          className={field}
        />
      </div>
      <div>
        <label className={label}>เวลาเช็คเอาท์</label>
        <input
          type="time"
          name="check_out_time"
          defaultValue={property?.check_out_time ?? "12:00"}
          className={field}
        />
      </div>

      <div>
        <label className={label}>VAT %</label>
        <input
          type="number"
          step="0.01"
          name="vat_percent"
          defaultValue={property?.vat_percent ?? 7}
          className={field}
        />
      </div>
      <div>
        <label className={label}>Service Charge %</label>
        <input
          type="number"
          step="0.01"
          name="service_charge_percent"
          defaultValue={property?.service_charge_percent ?? 0}
          className={field}
        />
      </div>

      <div className="col-span-2 rounded-md bg-neutral-50 p-3 dark:bg-neutral-900/50">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="tax_inclusive"
            defaultChecked={property?.tax_inclusive ?? true}
          />
          <span>
            ราคาที่ตั้ง <b>รวมภาษีแล้ว</b> (tax-inclusive)
          </span>
        </label>
        <p className="mt-1 text-xs text-neutral-500">
          ติ๊ก = ราคาห้องที่ใส่รวม VAT/SC แล้ว (ระบบแตกยอดภาษีย้อนกลับ) ·
          ไม่ติ๊ก = บวกภาษีเพิ่มตอนคิดเงิน
        </p>
      </div>

      {error && (
        <p className="col-span-2 text-sm text-red-600">{error}</p>
      )}

      <div className="col-span-2">
        <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-neutral-900">
          {isEdit ? "บันทึก" : "เพิ่มสาขา"}
        </button>
      </div>
    </form>
  );
}
