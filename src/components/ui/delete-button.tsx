"use client";

import { useState } from "react";
import { Button } from "./button";
import { ConfirmDialog } from "./confirm-dialog";
import { useToast } from "./toast";

// DeleteButton — ปุ่มลบที่มี ConfirmDialog ในตัว + toast ผลลัพธ์
// ใช้แทนการเขียน confirm/toast ซ้ำในทุกหน้า (rules.md #17)
// action: server action ที่รับ FormData (มี hidden fields ที่ caller ส่งมาผ่าน hiddenFields)
export function DeleteButton({
  action,
  hiddenFields,
  label = "ลบ",
  confirmTitle,
  confirmDescription,
  successMessage = "ลบเรียบร้อย",
  size = "sm",
}: {
  action: (fd: FormData) => Promise<void>;
  hiddenFields: Record<string, string>;
  label?: string;
  confirmTitle: string;
  confirmDescription?: string;
  successMessage?: string;
  size?: "sm" | "md" | "lg";
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function onConfirm() {
    setBusy(true);
    try {
      const fd = new FormData();
      for (const [k, v] of Object.entries(hiddenFields)) fd.set(k, v);
      await action(fd);
      toast.ok(successMessage);
      setOpen(false);
    } catch (e) {
      toast.err(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="danger" size={size} type="button" onClick={() => setOpen(true)}>
        {label}
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={onConfirm}
        title={confirmTitle}
        description={confirmDescription}
        confirmLabel={label}
        tone="danger"
        loading={busy}
      />
    </>
  );
}
