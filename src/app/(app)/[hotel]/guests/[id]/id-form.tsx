"use client";

import { Field, Input, Select, Button, useToast } from "@/components/ui";
import { updateGuestId, eraseGuestId } from "../actions";
import { isNextControlFlowError } from "@/lib/next-error";

export function GuestIdForm({
  hotelSlug,
  guestId,
  idType,
  idNumber,
  hasConsent,
  canEdit,
}: {
  hotelSlug: string;
  guestId: string;
  idType: string;
  idNumber: string;
  hasConsent: boolean;
  canEdit: boolean;
}) {
  const toast = useToast();

  async function onSubmit(fd: FormData) {
    try {
      await updateGuestId(fd);
      toast.ok("บันทึกแล้ว");
    } catch (e) {
      if (isNextControlFlowError(e)) throw e; // ปล่อย redirect/notFound ให้ Next
      toast.err(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    }
  }
  async function onErase(fd: FormData) {
    try {
      await eraseGuestId(fd);
      toast.ok("ลบข้อมูลบัตรแล้ว");
    } catch (e) {
      if (isNextControlFlowError(e)) throw e; // ปล่อย redirect/notFound ให้ Next
      toast.err(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    }
  }

  if (!canEdit) {
    return (
      <div className="text-sm text-fg-muted">
        <div>ประเภท: {idType || "-"}</div>
        <div>เลข: {idNumber || "-"}</div>
        <p className="mt-1 text-xs text-fg-subtle">คุณไม่มีสิทธิ์แก้ไข (guests.edit)</p>
      </div>
    );
  }

  return (
    <>
      <form action={onSubmit} className="grid grid-cols-2 gap-3">
        <input type="hidden" name="hotelSlug" value={hotelSlug} />
        <input type="hidden" name="guestId" value={guestId} />
        <Field label="ประเภทเอกสาร">
          <Select
            name="id_type"
            defaultValue={idType}
            className="w-full"
            options={[
              { value: "", label: "—" },
              { value: "national_id", label: "บัตรประชาชน" },
              { value: "passport", label: "Passport" },
            ]}
          />
        </Field>
        <Field label="เลขที่">
          <Input name="id_number" defaultValue={idNumber} className="w-full" />
        </Field>
        <label className="col-span-2 flex items-center gap-2 text-sm">
          <input type="checkbox" name="pdpa_consent" defaultChecked={hasConsent} />
          แขกยินยอมให้เก็บข้อมูลส่วนบุคคล (PDPA)
        </label>

        <div className="col-span-2 flex items-center gap-2">
          <Button type="submit">บันทึก</Button>
        </div>
      </form>

      {/* right to erasure — แยกฟอร์มกัน submit พร้อมกัน */}
      <form action={onErase} className="mt-2">
        <input type="hidden" name="hotelSlug" value={hotelSlug} />
        <input type="hidden" name="guestId" value={guestId} />
        <Button type="submit" variant="ghost" size="sm" className="text-danger">
          ลบข้อมูลบัตร (สิทธิ์ถูกลืม)
        </Button>
      </form>

      <p className="mt-2 text-xs text-fg-subtle">
        อัปโหลดรูปบัตร (guest-ids bucket) จะเพิ่มในรอบถัดไป — ตอนนี้เก็บเลขเอกสาร + consent
      </p>
    </>
  );
}
