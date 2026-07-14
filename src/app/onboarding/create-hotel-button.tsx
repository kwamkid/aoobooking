"use client";

import { useState } from "react";
import { Modal, Field, Input, Button, useToast } from "@/components/ui";
import { createHotel } from "./actions";

// ปุ่มสร้างโรงแรมใหม่ → เปิด modal ฟอร์ม
// ถ้ายังไม่มีโรงแรมเลย (hasHotels=false) เปิด modal อัตโนมัติเพื่อลื่นไหล
export function CreateHotelButton({ hasHotels }: { hasHotels: boolean }) {
  const [open, setOpen] = useState(!hasHotels);
  const [pending, setPending] = useState(false);
  const toast = useToast();

  async function onSubmit(fd: FormData) {
    setPending(true);
    try {
      await createHotel(fd); // redirect ถ้าสำเร็จ
    } catch (e) {
      setPending(false);
      toast.err(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    }
  }

  return (
    <>
      <Button
        variant={hasHotels ? "secondary" : "primary"}
        className="w-full"
        onClick={() => setOpen(true)}
      >
        + สร้างโรงแรมใหม่
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="สร้างโรงแรมใหม่">
        <form action={onSubmit} className="flex flex-col gap-3">
          <Field label="ชื่อโรงแรม">
            <Input name="name" placeholder="เช่น บ้านสวนรีสอร์ท" required autoFocus />
          </Field>
          <Field label="URL โรงแรม (เว้นว่างได้ — ระบบสร้างจากชื่อ)">
            <Input
              name="slug"
              placeholder="เช่น baan-suan"
              pattern="[a-z0-9-]*"
              className="font-mono"
            />
          </Field>
          <p className="text-xs text-fg-subtle">
            หน้าเว็บโรงแรมจะเป็น aoobooking.com/
            <span className="font-mono text-fg-muted">URL โรงแรม</span>
          </p>
          <Button type="submit" disabled={pending} className="mt-1">
            {pending ? "กำลังสร้าง..." : "สร้างโรงแรม"}
          </Button>
        </form>
      </Modal>
    </>
  );
}
