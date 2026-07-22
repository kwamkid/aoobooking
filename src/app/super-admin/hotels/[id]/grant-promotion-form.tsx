"use client";

import { useState, useTransition } from "react";
import {
  Modal,
  Button,
  Field,
  Input,
  Select,
  useToast,
  type SelectOption,
} from "@/components/ui";
import { grantPromotion } from "./actions";
import { isNextControlFlowError } from "@/lib/next-error";

export function GrantPromotionForm({
  hotelId,
  packageOptions,
  defaultPackageId,
}: {
  hotelId: string;
  packageOptions: SelectOption[];
  defaultPackageId?: string;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const [packageId, setPackageId] = useState(
    defaultPackageId ?? packageOptions[0]?.value ?? "",
  );
  const [months, setMonths] = useState("3");
  const [note, setNote] = useState("");

  const submit = () => {
    const monthsNum = Number(months);
    if (!packageId) {
      toast.err("เลือกแพ็กเกจก่อน");
      return;
    }
    if (!Number.isInteger(monthsNum) || monthsNum < 1) {
      toast.err("จำนวนเดือนต้องเป็นจำนวนเต็มตั้งแต่ 1 ขึ้นไป");
      return;
    }

    startTransition(async () => {
      try {
        const result = await grantPromotion({
          hotelId,
          packageId,
          months: monthsNum,
          note: note.trim() || undefined,
        });
        const until = new Date(result.trial_until).toLocaleDateString("th-TH", {
          day: "numeric",
          month: "long",
          year: "numeric",
        });
        toast.ok(`ให้โปรโมชันแล้ว — ใช้ฟรีถึง ${until}`);
        setOpen(false);
        setNote("");
      } catch (e) {
        if (isNextControlFlowError(e)) throw e; // ปล่อย redirect/notFound ให้ Next
        toast.err(e instanceof Error ? e.message : "ให้โปรโมชันไม่สำเร็จ");
      }
    });
  };

  return (
    <>
      <Button onClick={() => setOpen(true)}>ให้ใช้ฟรี N เดือน</Button>

      <Modal
        open={open}
        onClose={() => !pending && setOpen(false)}
        title="ให้ใช้ฟรี"
        description="ตั้งแพ็กเกจให้โรงแรมนี้แบบทดลองใช้ฟรี (ไม่สร้างใบแจ้งหนี้) — หมดช่วงฟรีแล้วระบบจะดันเข้า grace ตามปกติ"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              ยกเลิก
            </Button>
            <Button onClick={submit} disabled={pending}>
              {pending ? "กำลังบันทึก…" : "ให้โปรโมชัน"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="แพ็กเกจ">
            <Select
              options={packageOptions}
              value={packageId}
              onChange={setPackageId}
              placeholder="เลือกแพ็กเกจ"
              disabled={pending}
            />
          </Field>

          <Field label="จำนวนเดือน">
            <Input
              type="number"
              min={1}
              step={1}
              value={months}
              onChange={(e) => setMonths(e.target.value)}
              disabled={pending}
            />
          </Field>

          <Field label="หมายเหตุ">
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="เช่น ลูกค้าเก่า / ดีลงานอีเวนต์"
              disabled={pending}
            />
          </Field>
        </div>
      </Modal>
    </>
  );
}
