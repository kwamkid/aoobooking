"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Modal } from "./modal";
import { Button } from "./button";

/* ============================================================================
 *  ConfirmDialog — dialog ยืนยันแทน window.confirm() (alert แนว popover)
 *
 *  ใช้ได้ 2 แบบ:
 *
 *  1) Declarative (parent คุม state) —
 *
 *       <ConfirmDialog
 *         open={open}
 *         title="ลบห้องนี้?"
 *         description="ข้อมูลห้องจะถูกลบถาวร"
 *         confirmLabel="ลบ"
 *         tone="danger"
 *         onConfirm={() => { ... }}
 *         onClose={() => setOpen(false)}
 *       />
 *
 *  2) Imperative (hook) — แทน `if (!confirm(...))` ใน event handler:
 *
 *       const { confirm, dialog } = useConfirm();
 *       async function handleDelete() {
 *         const ok = await confirm({ title: "ลบ?", tone: "danger", confirmLabel: "ลบ" });
 *         if (!ok) return;
 *         // ...
 *       }
 *       return (<>{dialog}<button onClick={handleDelete}>ลบ</button></>);
 * ========================================================================== */

export type ConfirmTone = "danger" | "default";

export interface ConfirmDialogProps {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  /** เนื้อหาเหนือปุ่ม — ถ้าส่งมาจะแทน description */
  children?: ReactNode;
  /** default: "ยืนยัน" */
  confirmLabel?: string;
  /** default: "ยกเลิก" */
  cancelLabel?: string;
  /** "danger" = ปุ่มยืนยันใช้ .btn-danger · default = .btn-primary */
  tone?: ConfirmTone;
  /** true = ปุ่ม disable + ปิด dialog ไม่ได้ (ระหว่างรอ action ภายนอก) */
  loading?: boolean;
  /** เรียกเมื่อ user ยืนยัน — async ได้ ปุ่มจะ disable ระหว่างรอ */
  onConfirm: () => void | Promise<void>;
  /** เรียกเมื่อ user ยกเลิก (ปุ่ม, Esc, ฉากหลัง) */
  onClose: () => void;
  /** false = ซ่อนปุ่มยกเลิก (เหลือปุ่มยืนยันอย่างเดียว) */
  showCancel?: boolean;
}

export function ConfirmDialog({
  open,
  title,
  description,
  children,
  confirmLabel = "ยืนยัน",
  cancelLabel = "ยกเลิก",
  tone = "default",
  loading = false,
  onConfirm,
  onClose,
  showCancel = true,
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  const disabled = busy || loading;

  // reset busy ทุกครั้งที่เปิดใหม่ — action รอบใหม่ไม่ติด disabled ค้างจากรอบก่อน
  useEffect(() => {
    if (open) setBusy(false);
  }, [open]);

  const handleConfirm = useCallback(async () => {
    if (disabled) return;
    try {
      setBusy(true);
      await onConfirm();
    } finally {
      setBusy(false);
    }
  }, [disabled, onConfirm]);

  return (
    <Modal
      open={open}
      onClose={disabled ? () => {} : onClose}
      title={title}
      maxWidth={440}
      dismissOnBackdrop={!disabled}
      hideCloseButton
      footer={
        <>
          {showCancel && (
            <Button variant="ghost" onClick={onClose} disabled={disabled}>
              {cancelLabel}
            </Button>
          )}
          <Button
            variant={tone === "danger" ? "danger" : "primary"}
            onClick={handleConfirm}
            disabled={disabled}
            autoFocus
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children ?? <p className="m-0 text-fg-muted">{description}</p>}
    </Modal>
  );
}

/* ----------------------------------------------------------------------------
 *  useConfirm — imperative API
 * -------------------------------------------------------------------------- */

export interface ConfirmOptions {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

/**
 * คืน:
 *  - `confirm(opts)`: เปิด dialog → resolve `true` ถ้ายืนยัน, `false` ถ้ายกเลิก/ปิด
 *  - `dialog`: JSX ที่ต้อง render ไว้ใน tree (ที่ไหนก็ได้ใน component)
 */
export function useConfirm() {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  // เก็บ pending ล่าสุดใน ref — callback identity คงที่แม้เปิดซ้ำกลางคัน
  const pendingRef = useRef<PendingConfirm | null>(null);
  pendingRef.current = pending;

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      // กัน double-click: ถ้ามีอันเก่าค้าง resolve เป็น false ก่อนแสดงอันใหม่
      const prev = pendingRef.current;
      if (prev) prev.resolve(false);
      setPending({ ...opts, resolve });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    const p = pendingRef.current;
    if (!p) return;
    p.resolve(true);
    setPending(null);
  }, []);

  const handleClose = useCallback(() => {
    const p = pendingRef.current;
    if (!p) return;
    p.resolve(false);
    setPending(null);
  }, []);

  const dialog = (
    <ConfirmDialog
      open={pending !== null}
      title={pending?.title ?? ""}
      description={pending?.description}
      confirmLabel={pending?.confirmLabel}
      cancelLabel={pending?.cancelLabel}
      tone={pending?.tone}
      onConfirm={handleConfirm}
      onClose={handleClose}
    >
      {pending?.children}
    </ConfirmDialog>
  );

  return { confirm, dialog };
}
