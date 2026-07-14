"use client";

import { useState } from "react";
import { updateGuestId, eraseGuestId } from "../actions";

const field =
  "rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900";
const label = "mb-1 block text-xs font-medium text-neutral-500";

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
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function onSubmit(fd: FormData) {
    setError(null);
    setOk(false);
    try {
      await updateGuestId(fd);
      setOk(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    }
  }
  async function onErase(fd: FormData) {
    setError(null);
    try {
      await eraseGuestId(fd);
    } catch (e) {
      setError(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    }
  }

  if (!canEdit) {
    return (
      <div className="text-sm text-neutral-500">
        <div>ประเภท: {idType || "-"}</div>
        <div>เลข: {idNumber || "-"}</div>
        <p className="mt-1 text-xs text-neutral-400">คุณไม่มีสิทธิ์แก้ไข (guests.edit)</p>
      </div>
    );
  }

  return (
    <>
      <form action={onSubmit} className="grid grid-cols-2 gap-3">
        <input type="hidden" name="hotelSlug" value={hotelSlug} />
        <input type="hidden" name="guestId" value={guestId} />
        <div>
          <label className={label}>ประเภทเอกสาร</label>
          <select name="id_type" defaultValue={idType} className={`w-full ${field}`}>
            <option value="">—</option>
            <option value="national_id">บัตรประชาชน</option>
            <option value="passport">Passport</option>
          </select>
        </div>
        <div>
          <label className={label}>เลขที่</label>
          <input name="id_number" defaultValue={idNumber} className={`w-full ${field}`} />
        </div>
        <label className="col-span-2 flex items-center gap-2 text-sm">
          <input type="checkbox" name="pdpa_consent" defaultChecked={hasConsent} />
          แขกยินยอมให้เก็บข้อมูลส่วนบุคคล (PDPA)
        </label>

        {error && <p className="col-span-2 text-sm text-red-600">{error}</p>}
        {ok && <p className="col-span-2 text-sm text-green-600">บันทึกแล้ว</p>}

        <div className="col-span-2 flex items-center gap-2">
          <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-neutral-900">
            บันทึก
          </button>
        </div>
      </form>

      {/* right to erasure — แยกฟอร์มกัน submit พร้อมกัน */}
      <form action={onErase} className="mt-2">
        <input type="hidden" name="hotelSlug" value={hotelSlug} />
        <input type="hidden" name="guestId" value={guestId} />
        <button className="text-xs text-red-600 underline">ลบข้อมูลบัตร (สิทธิ์ถูกลืม)</button>
      </form>

      <p className="mt-2 text-xs text-neutral-400">
        อัปโหลดรูปบัตร (guest-ids bucket) จะเพิ่มในรอบถัดไป — ตอนนี้เก็บเลขเอกสาร + consent
      </p>
    </>
  );
}
