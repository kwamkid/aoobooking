"use client";

import { useRef, useState } from "react";
import type { Database } from "@/types/database";
import { MoreHorizontal } from "lucide-react";
import {
  DataTable,
  type DataTableColumn,
  Badge,
  Popover,
  useConfirm,
  useToast,
} from "@/components/ui";
import { isNextControlFlowError } from "@/lib/next-error";
import { endTenancy } from "./actions";

type Row = Database["public"]["Functions"]["search_tenancies"]["Returns"][number];

const STATUS_TH: Record<string, string> = {
  active: "กำลังเช่า",
  ended: "ย้ายออกแล้ว",
};

function fmtSlash(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return "-";
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}
function baht(satang: number): string {
  return (satang / 100).toLocaleString("th-TH");
}

export function TenantsTable({ rows, hotelSlug }: { rows: Row[]; hotelSlug: string }) {
  const columns: DataTableColumn<Row>[] = [
    {
      key: "guest_name",
      header: "ผู้เช่า",
      sortable: true,
      render: (t) => (
        <>
          <div className="font-medium text-fg">{t.guest_name ?? "-"}</div>
          {t.guest_phone && (
            <div className="text-sm text-fg-subtle">{t.guest_phone}</div>
          )}
        </>
      ),
    },
    {
      key: "room_number",
      header: "ห้อง",
      sortable: true,
      render: (t) => (
        <>
          <span className="font-medium tabular-nums text-fg">{t.room_number}</span>
          <span className="ml-2 text-sm text-fg-muted">{t.room_type_name}</span>
        </>
      ),
    },
    {
      key: "start_date",
      header: "เข้าอยู่",
      sortable: true,
      render: (t) => (
        <span className="whitespace-nowrap tabular-nums text-fg">
          {fmtSlash(t.start_date)}
          <span className="text-fg-muted">
            {" → "}
            {t.end_date ? fmtSlash(t.end_date) : "อยู่ยาว"}
          </span>
        </span>
      ),
    },
    {
      key: "rent_satang",
      header: "ค่าเช่า/เดือน",
      align: "right",
      sortable: true,
      render: (t) => (
        <>
          <div className="font-medium tabular-nums text-fg">{baht(t.rent_satang)}฿</div>
          {t.deposit_satang > 0 && (
            <div className="text-sm tabular-nums text-fg-subtle">
              มัดจำ {baht(t.deposit_satang)}
            </div>
          )}
        </>
      ),
    },
    {
      key: "status",
      header: "สถานะ",
      render: (t) => (
        <Badge tone={t.status === "active" ? "success" : "neutral"}>
          {STATUS_TH[t.status] ?? t.status}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      width: 56,
      render: (t) =>
        t.status === "active" ? <RowActions tenancy={t} hotelSlug={hotelSlug} /> : null,
    },
  ];

  return <DataTable columns={columns} data={rows} keyField="id" pagination={false} />;
}

function RowActions({ tenancy: t, hotelSlug }: { tenancy: Row; hotelSlug: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const toast = useToast();
  const { confirm, dialog } = useConfirm();

  async function onEnd() {
    setOpen(false);
    // จำเป็นต้อง confirm — ปิดสัญญา + ปลดห้องกลับไปขายรายวัน ย้อนไม่ได้
    const ok = await confirm({
      title: `ย้ายออก — ${t.guest_name ?? ""} (ห้อง ${t.room_number})?`,
      description:
        "ปิดสัญญาเช่าวันนี้ · ห้องจะกลับมาขายรายวันได้ทันที · เงินมัดจำคืน/หักค่าเสียหายบันทึกในระบบบิล (กำลังตามมา)",
      tone: "danger",
      confirmLabel: "ย้ายออก",
    });
    if (!ok) return;
    setPending(true);
    try {
      const fd = new FormData();
      fd.set("hotelSlug", hotelSlug);
      fd.set("tenancyId", t.id);
      await endTenancy(fd);
      toast.ok(`ปิดสัญญาห้อง ${t.room_number} แล้ว`);
    } catch (e) {
      if (isNextControlFlowError(e)) throw e;
      toast.err(e instanceof Error ? e.message : "ทำรายการไม่สำเร็จ");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      {dialog}
      <button
        ref={ref}
        type="button"
        disabled={pending}
        onClick={() => setOpen((v) => !v)}
        aria-label="เมนูผู้เช่า"
        className="btn btn-ghost btn-sm"
      >
        <MoreHorizontal size={17} />
      </button>
      <Popover
        open={open}
        onClose={() => setOpen(false)}
        anchor={ref.current}
        align="end"
        minWidth={160}
        ariaLabel="เมนูผู้เช่า"
      >
        <div className="p-1">
          <button
            type="button"
            onClick={onEnd}
            className="block w-full rounded-sm px-3 py-2 text-left text-base text-danger-strong transition-colors hover:bg-bg-subtle"
          >
            ย้ายออก
          </button>
        </div>
      </Popover>
    </>
  );
}
