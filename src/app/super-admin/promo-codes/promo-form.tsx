"use client";

import { useState, useTransition } from "react";
import {
  Modal,
  Field,
  Input,
  Select,
  Button,
  Badge,
  DataTable,
  EmptyState,
  useToast,
  type SelectOption,
  type DataTableColumn,
} from "@/components/ui";
import { createPromoCode, togglePromoCode } from "./actions";
import { isNextControlFlowError } from "@/lib/next-error";

/* ============================================================================
 *  PromoForm — ปุ่ม "สร้างโค้ด" + modal ฟอร์ม
 *  PromoTable — ตารางโค้ด (client: DataTable มี sort/pagination ในตัว)
 *  TogglePromoButton — เปิด/ปิดโค้ดรายแถว
 * ========================================================================== */

export interface PromoRow {
  id: string;
  code: string;
  free_months: number;
  max_uses: number | null;
  used_count: number;
  expires_at: string | null;
  is_active: boolean;
  note: string | null;
  packages: { name: string; slug: string } | null;
}

const EMPTY = {
  code: "",
  packageId: "",
  freeMonths: "3",
  maxUses: "",
  expiresAt: "",
  note: "",
};

export function PromoForm({ packages }: { packages: SelectOption[] }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function set<K extends keyof typeof EMPTY>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function close() {
    setOpen(false);
    setForm(EMPTY);
  }

  function submit() {
    startTransition(async () => {
      try {
        await createPromoCode({
          code: form.code,
          packageId: form.packageId,
          freeMonths: Number(form.freeMonths),
          maxUses: form.maxUses.trim() ? Number(form.maxUses) : null,
          expiresAt: form.expiresAt.trim() || null,
          note: form.note.trim() || null,
        });
        toast.ok("สร้างโค้ดแล้ว");
        close();
      } catch (e) {
        if (isNextControlFlowError(e)) throw e; // ปล่อย redirect/notFound ให้ Next
        toast.err(e instanceof Error ? e.message : "สร้างโค้ดไม่สำเร็จ");
      }
    });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>สร้างโค้ด</Button>

      <Modal
        open={open}
        onClose={close}
        title="สร้างโค้ดโปรโมชัน"
        description="โรงแรมกรอกโค้ดนี้เพื่อใช้แพ็กเกจฟรีตามจำนวนเดือนที่กำหนด"
        footer={
          <>
            <Button variant="secondary" onClick={close} disabled={pending}>
              ยกเลิก
            </Button>
            <Button onClick={submit} disabled={pending}>
              {pending ? "กำลังสร้าง…" : "สร้างโค้ด"}
            </Button>
          </>
        }
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Field label="โค้ด">
            <Input
              value={form.code}
              onChange={(e) => set("code", e.target.value.toUpperCase())}
              placeholder="FREE3M"
              autoCapitalize="characters"
              className="font-mono"
              required
            />
          </Field>

          <Field label="แพ็กเกจ">
            <Select
              options={packages}
              value={form.packageId}
              onChange={(v) => set("packageId", v)}
              placeholder="— เลือกแพ็กเกจ —"
              ariaLabel="แพ็กเกจ"
            />
          </Field>

          <Field label="จำนวนเดือนฟรี">
            <Input
              type="number"
              min={1}
              step={1}
              value={form.freeMonths}
              onChange={(e) => set("freeMonths", e.target.value)}
              required
            />
          </Field>

          <Field label="จำกัดจำนวนครั้ง">
            <Input
              type="number"
              min={1}
              step={1}
              value={form.maxUses}
              onChange={(e) => set("maxUses", e.target.value)}
              placeholder="เว้นว่าง = ไม่จำกัด"
            />
          </Field>

          <Field label="วันหมดอายุ">
            <Input
              type="date"
              value={form.expiresAt}
              onChange={(e) => set("expiresAt", e.target.value)}
            />
            <p className="mt-1 text-xs text-fg-subtle">เว้นว่าง = ไม่หมดอายุ</p>
          </Field>

          <Field label="หมายเหตุ">
            <Input
              value={form.note}
              onChange={(e) => set("note", e.target.value)}
              placeholder="เช่น งาน Thailand Hotel Expo 2026"
            />
          </Field>
        </form>
      </Modal>
    </>
  );
}

const dateFmt = new Intl.DateTimeFormat("th-TH", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function PromoTable({ rows }: { rows: PromoRow[] }) {
  const columns: DataTableColumn<PromoRow>[] = [
    {
      key: "code",
      header: "โค้ด",
      sortable: true,
      render: (r) => <span className="font-mono font-medium text-fg">{r.code}</span>,
    },
    {
      key: "package",
      header: "แพ็กเกจ",
      render: (r) =>
        r.packages ? (
          <Badge tone="brand">{r.packages.name}</Badge>
        ) : (
          <span className="text-fg-subtle">—</span>
        ),
    },
    {
      key: "free_months",
      header: "ฟรี",
      sortable: true,
      render: (r) => `${r.free_months} เดือน`,
    },
    {
      key: "used_count",
      header: "ใช้แล้ว",
      sortable: true,
      render: (r) => (
        <span className="text-fg-muted">
          {r.used_count}/{r.max_uses ?? "ไม่จำกัด"}
        </span>
      ),
    },
    {
      key: "expires_at",
      header: "หมดอายุ",
      sortable: true,
      render: (r) =>
        r.expires_at ? (
          dateFmt.format(new Date(r.expires_at))
        ) : (
          <span className="text-fg-subtle">ไม่หมดอายุ</span>
        ),
    },
    {
      key: "is_active",
      header: "สถานะ",
      sortable: true,
      render: (r) => (
        <Badge tone={r.is_active ? "success" : "neutral"}>
          {r.is_active ? "ใช้ได้" : "ปิด"}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (r) => <TogglePromoButton id={r.id} isActive={r.is_active} />,
    },
  ];

  return (
    <DataTable<PromoRow>
      columns={columns}
      data={rows}
      keyField="id"
      pagination={{ pageSize: 20 }}
      emptyState={<EmptyState art="receipt" title="ยังไม่มีโค้ด" />}
    />
  );
}

export function TogglePromoButton({
  id,
  isActive,
}: {
  id: string;
  isActive: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function toggle() {
    startTransition(async () => {
      try {
        await togglePromoCode(id, !isActive);
        toast.ok(isActive ? "ปิดโค้ดแล้ว" : "เปิดโค้ดแล้ว");
      } catch (e) {
        if (isNextControlFlowError(e)) throw e; // ปล่อย redirect/notFound ให้ Next
        toast.err(e instanceof Error ? e.message : "เปลี่ยนสถานะไม่สำเร็จ");
      }
    });
  }

  return (
    <Button variant="secondary" size="sm" onClick={toggle} disabled={pending}>
      {isActive ? "ปิด" : "เปิด"}
    </Button>
  );
}
