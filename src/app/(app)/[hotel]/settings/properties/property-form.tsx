"use client";

import { Field, Input, Button, useToast } from "@/components/ui";
import { createProperty, updateProperty } from "./actions";
import { isNextControlFlowError } from "@/lib/next-error";

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
  monthly_deposit_months: number;
  water_unit_satang: number;
  electric_unit_satang: number;
  tax_inclusive: boolean;
};

export function PropertyForm({
  hotelSlug,
  property,
}: {
  hotelSlug: string;
  property?: Property;
}) {
  const isEdit = !!property;
  const toast = useToast();

  async function onSubmit(fd: FormData) {
    try {
      if (isEdit) await updateProperty(fd);
      else await createProperty(fd);
      toast.ok(isEdit ? "บันทึกสาขาแล้ว" : "เพิ่มสาขาแล้ว");
    } catch (e) {
      if (isNextControlFlowError(e)) throw e; // ปล่อย redirect/notFound ให้ Next
      toast.err(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    }
  }

  return (
    <form action={onSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <input type="hidden" name="hotelSlug" value={hotelSlug} />
      {isEdit && <input type="hidden" name="propertyId" value={property.id} />}

      <Field label="ชื่อสาขา *" className="sm:col-span-2">
        <Input name="name" required defaultValue={property?.name} />
      </Field>

      {!isEdit && (
        <Field
          label="URL สาขา (เว้นว่างได้ — ระบบสร้างจากชื่อ)"
          className="sm:col-span-2"
        >
          <Input name="slug" placeholder="phuket" />
        </Field>
      )}

      <Field label="ที่อยู่" className="sm:col-span-2">
        <Input name="address" defaultValue={property?.address ?? ""} />
      </Field>

      <Field label="โทรศัพท์">
        <Input name="phone" defaultValue={property?.phone ?? ""} />
      </Field>
      <Field label="Timezone">
        <Input name="timezone" defaultValue={property?.timezone ?? "Asia/Bangkok"} />
      </Field>

      <Field label="เวลาเช็คอิน">
        <Input type="time" name="check_in_time" defaultValue={property?.check_in_time ?? "14:00"} />
      </Field>
      <Field label="เวลาเช็คเอาท์">
        <Input type="time" name="check_out_time" defaultValue={property?.check_out_time ?? "12:00"} />
      </Field>

      <Field label="VAT %">
        <Input
          type="number"
          step="0.01"
          name="vat_percent"
          defaultValue={property?.vat_percent ?? 7}
        />
      </Field>
      <Field label="Service Charge %">
        <Input
          type="number"
          step="0.01"
          name="service_charge_percent"
          defaultValue={property?.service_charge_percent ?? 0}
        />
      </Field>

      {/* โมดูลเช่ารายเดือน — default ตอนสร้างสัญญา + ใช้ออกบิล (M3) */}
      <Field
        label="มัดจำเช่ารายเดือน (เดือน)"
        hint={<>จำนวนเดือนของค่าเช่าที่เก็บเป็นเงินประกันตอนทำสัญญา — คืนตอนย้ายออก</>}
      >
        <Input
          type="number"
          min={0}
          name="monthly_deposit_months"
          defaultValue={property?.monthly_deposit_months ?? 1}
        />
      </Field>
      <Field label="ค่าน้ำ (บาท/หน่วย)" hint={<>ใช้คำนวณบิลผู้เช่ารายเดือนตามมิเตอร์</>}>
        <Input
          type="number"
          step="0.01"
          min={0}
          name="water_unit"
          defaultValue={property ? property.water_unit_satang / 100 : 0}
        />
      </Field>
      <Field label="ค่าไฟ (บาท/หน่วย)" hint={<>ใช้คำนวณบิลผู้เช่ารายเดือนตามมิเตอร์</>}>
        <Input
          type="number"
          step="0.01"
          min={0}
          name="electric_unit"
          defaultValue={property ? property.electric_unit_satang / 100 : 0}
        />
      </Field>

      <div className="rounded-(--radius) bg-bg-subtle p-3 sm:col-span-2">
        <label className="flex items-center gap-2 text-sm text-fg">
          <input
            type="checkbox"
            name="tax_inclusive"
            defaultChecked={property?.tax_inclusive ?? true}
          />
          <span>
            ราคาที่ตั้ง <b>รวมภาษีแล้ว</b> (tax-inclusive)
          </span>
        </label>
        <p className="mt-1 text-xs text-fg-muted">
          ติ๊ก = ราคาห้องที่ใส่รวม VAT/SC แล้ว (ระบบแตกยอดภาษีย้อนกลับ) · ไม่ติ๊ก =
          บวกภาษีเพิ่มตอนคิดเงิน
        </p>
      </div>


      <div className="sm:col-span-2">
        <Button type="submit">{isEdit ? "บันทึก" : "เพิ่มสาขา"}</Button>
      </div>
    </form>
  );
}
