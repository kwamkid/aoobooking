"use client";

import { useState } from "react";
import {
  Button,
  Select,
  Modal,
  useConfirm,
  useToast,
  DateRangePicker,
  TimePicker,
  TimeRangePicker,
  DataTable,
  type DataTableColumn,
  type DateRange,
  type TimeRange,
} from "@/components/ui";

// ============================================================================
// Interactive demos สำหรับหน้า /design (client — มี state)
// ============================================================================

export function ToastDemo() {
  const toast = useToast();
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" onClick={() => toast.ok("บันทึกเรียบร้อย")}>
        toast.ok
      </Button>
      <Button size="sm" variant="danger" onClick={() => toast.err("เกิดข้อผิดพลาด — ลองใหม่")}>
        toast.err
      </Button>
      <Button size="sm" variant="secondary" onClick={() => toast.info("มีการจองใหม่เข้ามา")}>
        toast.info
      </Button>
    </div>
  );
}

export function ModalDemo() {
  const [open, setOpen] = useState(false);
  const { confirm, dialog } = useConfirm();
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        เปิด Modal
      </Button>
      <Button
        size="sm"
        variant="danger"
        onClick={async () => {
          await confirm({
            title: "ยกเลิกการจองนี้?",
            description: "ระบบจะคืน inventory และคำนวณยอดคืนตามนโยบาย",
            confirmLabel: "ยกเลิกการจอง",
            tone: "danger",
          });
        }}
      >
        เปิด ConfirmDialog
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="ตัวอย่าง Modal"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>
              ปิด
            </Button>
            <Button size="sm" onClick={() => setOpen(false)}>
              ตกลง
            </Button>
          </div>
        }
      >
        <p className="text-sm text-fg-muted">
          เนื้อหาใน modal — Escape / คลิกฉากหลัง / ปุ่ม × ปิดได้
        </p>
      </Modal>
      {dialog}
    </div>
  );
}

export function PickerDemo() {
  const [range, setRange] = useState<DateRange | null>(null);
  const [single, setSingle] = useState<string | null>(null);
  const [time, setTime] = useState("14:00");
  const [timeRange, setTimeRange] = useState<TimeRange>({ from: "14:00", to: "12:00" });

  return (
    <div className="grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
      <div>
        <span className="field-label">DateRangePicker (range + presets)</span>
        <DateRangePicker mode="range" value={range} onChange={setRange} />
      </div>
      <div>
        <span className="field-label">DateRangePicker (single)</span>
        <DateRangePicker mode="single" value={single} onChange={setSingle} />
      </div>
      <div>
        <span className="field-label">TimePicker (พิมพ์ &quot;930&quot; ได้)</span>
        <TimePicker value={time} onChange={setTime} />
      </div>
      <div>
        <span className="field-label">TimeRangePicker</span>
        <TimeRangePicker value={timeRange} onChange={setTimeRange} />
      </div>
    </div>
  );
}

// ── DataTable demo ──
type DemoRow = {
  id: string;
  code: string;
  guest: string;
  checkIn: string;
  total: number | null;
};
const DEMO_ROWS: DemoRow[] = [
  { id: "1", code: "BK-7Q3ZP2", guest: "สมชาย ใจดี", checkIn: "2026-07-20", total: 250000 },
  { id: "2", code: "BK-M4X8KD", guest: "อรุณี แสงทอง", checkIn: "2026-07-18", total: 480000 },
  { id: "3", code: "BK-A2B9CF", guest: "John Smith", checkIn: "2026-07-25", total: 120000 },
  { id: "4", code: "BK-T6Y2WN", guest: "วิภา รักเรียน", checkIn: "2026-07-15", total: null },
  { id: "5", code: "BK-H8J4RS", guest: "ประเสริฐ มั่งมี", checkIn: "2026-08-01", total: 990000 },
  { id: "6", code: "BK-Q1Z7VL", guest: "Alice Wong", checkIn: "2026-07-22", total: 350000 },
  { id: "7", code: "BK-C5N3XB", guest: "กมล ชาญชัย", checkIn: "2026-07-19", total: 175000 },
];

const DEMO_COLUMNS: DataTableColumn<DemoRow>[] = [
  { key: "code", header: "โค้ด", sortable: true },
  { key: "guest", header: "แขก", sortable: true },
  { key: "checkIn", header: "เช็คอิน", sortable: true },
  {
    key: "total",
    header: "ยอด",
    sortable: true,
    align: "right",
    render: (r) => (r.total == null ? "—" : `${(r.total / 100).toLocaleString()}฿`),
  },
];

export function DataTableDemo() {
  return (
    <DataTable<DemoRow>
      columns={DEMO_COLUMNS}
      data={DEMO_ROWS}
      keyField="id"
      pagination={{ pageSize: 5 }}
      emptyState={<span>ไม่มีข้อมูล</span>}
    />
  );
}
