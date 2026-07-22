"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import type { Database } from "@/types/database";
import {
  Modal,
  Field,
  Input,
  Select,
  Button,
  Badge,
  useToast,
} from "@/components/ui";
import { isNextControlFlowError } from "@/lib/next-error";
import { addFolioItems, voidFolioItem, type NewFolioItem } from "./actions";

/* Folio — รายการค่าใช้จ่ายทั้งหมดของ booking (ค่าห้อง auto + เพิ่มเอง)
 * เพิ่มรายการผ่าน modal · void = ตีเป็นโมฆะพร้อมเหตุผล (ห้ามลบ — §17)
 * ยอดสรุป (รวม/ชำระ/ค้าง) แสดงที่การ์ดการชำระเงินฝั่ง page */

type FolioCategory = Database["public"]["Enums"]["folio_item_category"];

export type FolioItemRow = {
  id: string;
  category: FolioCategory;
  description: string;
  qty: number;
  unit_price_satang: number;
  amount_satang: number;
  vat_satang: number;
  service_charge_satang: number;
  voided_at: string | null;
  void_reason: string | null;
  created_at: string;
};

const CATEGORY_TH: Record<FolioCategory, string> = {
  room: "ค่าห้อง",
  food: "อาหาร/เครื่องดื่ม",
  minibar: "มินิบาร์",
  laundry: "ซักรีด",
  spa: "สปา",
  service_charge: "ค่าบริการ",
  vat: "ภาษี",
  other: "อื่นๆ",
};

// หมวดที่พนักงานเพิ่มเองได้ (room ระบบ post เอง · vat/sc เป็น snapshot ในรายการ)
const ADD_OPTIONS = (["food", "minibar", "laundry", "spa", "other"] as const).map((c) => ({
  value: c,
  label: CATEGORY_TH[c],
}));

// placeholder รายละเอียด เปลี่ยนตามหมวดที่เลือก (เจ้าของขอ 2026-07-22)
const DESC_PLACEHOLDER: Record<string, string> = {
  food: "เช่น ข้าวผัดกุ้ง + น้ำเปล่า",
  minibar: "เช่น น้ำอัดลม 2 กระป๋อง",
  laundry: "เช่น ซักเสื้อ 5 ตัว",
  spa: "เช่น นวดไทย 1 ชั่วโมง",
  other: "เช่น ค่าเตียงเสริม",
};

// แถวในฟอร์มเพิ่มรายการ (กรอกหลายรายการแล้วบันทึกทีเดียว)
type DraftRow = { key: number; category: string; description: string; qty: string; unitPrice: string };
const emptyRow = (key: number): DraftRow => ({
  key,
  category: "food",
  description: "",
  qty: "1",
  unitPrice: "",
});

function baht(satang: number): string {
  return (satang / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 });
}
function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(2)}`;
}

export function FolioSection({
  hotelSlug,
  bookingId,
  items,
  taxInclusive,
  bookingOpen,
  canAdd,
  canVoid,
}: {
  hotelSlug: string;
  bookingId: string;
  items: FolioItemRow[];
  /** true = ราคารวมภาษีแล้ว (ยอดรายการ = amount) · false = ต้องบวก vat+sc */
  taxInclusive: boolean;
  /** booking ยังไม่ปิด (เพิ่มรายการได้) */
  bookingOpen: boolean;
  canAdd: boolean;
  canVoid: boolean;
}) {
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  // ฟอร์มเพิ่ม: หลายแถว บันทึกทีเดียว
  const [rows, setRows] = useState<DraftRow[]>([emptyRow(0)]);
  // void inline — แถวที่กำลังกรอกเหตุผล
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState("");

  const itemTotal = (i: FolioItemRow) =>
    i.amount_satang + (taxInclusive ? 0 : i.vat_satang + i.service_charge_satang);

  function patchRow(key: number, patch: Partial<DraftRow>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  function openAdd() {
    setRows([emptyRow(0)]);
    setAdding(true);
  }

  // แถวที่กรอกครบ (รายละเอียด + ราคา) — แถวว่างท้ายๆ ข้ามให้เฉยๆ ไม่ถือเป็น error
  const filled = rows.filter((r) => r.description.trim() && Number(r.unitPrice) > 0);
  const draftTotal = filled.reduce(
    (sum, r) => sum + Math.round(Number(r.unitPrice) * 100) * Math.max(Math.floor(Number(r.qty)) || 1, 1),
    0,
  );

  async function onAdd() {
    if (filled.length === 0) {
      toast.err("กรอกรายละเอียดและราคาอย่างน้อย 1 รายการ");
      return;
    }
    setSaving(true);
    try {
      const items: NewFolioItem[] = filled.map((r) => ({
        category: r.category as NewFolioItem["category"],
        description: r.description,
        qty: Math.max(Math.floor(Number(r.qty)) || 1, 1),
        unitPriceBaht: Number(r.unitPrice),
      }));
      const fd = new FormData();
      fd.set("hotelSlug", hotelSlug);
      fd.set("bookingId", bookingId);
      fd.set("items", JSON.stringify(items));
      await addFolioItems(fd);
      toast.ok(items.length === 1 ? "เพิ่มรายการแล้ว" : `เพิ่ม ${items.length} รายการแล้ว`);
      setAdding(false);
    } catch (e) {
      if (isNextControlFlowError(e)) throw e;
      toast.err(e instanceof Error ? e.message : "เพิ่มไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function onVoid(itemId: string) {
    try {
      const fd = new FormData();
      fd.set("hotelSlug", hotelSlug);
      fd.set("bookingId", bookingId);
      fd.set("itemId", itemId);
      fd.set("reason", voidReason);
      await voidFolioItem(fd);
      toast.ok("ยกเลิกรายการแล้ว");
      setVoidingId(null);
      setVoidReason("");
    } catch (e) {
      if (isNextControlFlowError(e)) throw e;
      toast.err(e instanceof Error ? e.message : "ทำรายการไม่สำเร็จ");
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-fg">ค่าใช้จ่าย (Folio)</h2>
        {canAdd && bookingOpen && (
          <Button size="sm" variant="secondary" onClick={openAdd}>
            <Plus size={15} className="mr-1" />
            เพิ่มรายการ
          </Button>
        )}
      </div>

      <ul className="divide-y divide-border">
        {items.map((i) => {
          const voided = !!i.voided_at;
          return (
            <li key={i.id} className="flex items-start justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <div className={`text-base ${voided ? "text-fg-subtle line-through" : "text-fg"}`}>
                  {i.description}
                  {voided && (
                    <span className="ml-2 no-underline">
                      <Badge tone="neutral">โมฆะ</Badge>
                    </span>
                  )}
                </div>
                <div className="text-sm text-fg-subtle">
                  {fmtDate(i.created_at)} · {CATEGORY_TH[i.category]}
                  {i.qty > 1 && ` · ${i.qty} × ${baht(i.unit_price_satang)}`}
                  {voided && i.void_reason && ` · เหตุผล: ${i.void_reason}`}
                </div>
                {/* ฟอร์มเหตุผล — โผล่เมื่อกด × ท้ายแถว */}
                {canVoid && !voided && i.category !== "room" && voidingId === i.id && (
                  <div className="mt-1.5 space-y-1.5">
                    <Input
                      value={voidReason}
                      onChange={(e) => setVoidReason(e.target.value)}
                      placeholder="เหตุผล เช่น คีย์ผิดรายการ"
                      className="w-full"
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={!voidReason.trim()}
                        onClick={() => onVoid(i.id)}
                      >
                        ยืนยันยกเลิกรายการ
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setVoidingId(null);
                          setVoidReason("");
                        }}
                      >
                        ไม่ใช่
                      </Button>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <span
                  className={`text-base font-medium tabular-nums ${
                    voided ? "text-fg-subtle line-through" : "text-fg"
                  }`}
                >
                  {baht(itemTotal(i))}฿
                </span>
                {/* × void ท้ายแถว (ลดความสูงแถว — เจ้าของขอ 2026-07-22) ·
                    ค่าห้อง/รายการโมฆะ = เว้นช่องไว้ให้ยอดตรงคอลัมน์กัน */}
                {canVoid &&
                  (!voided && i.category !== "room" ? (
                    <button
                      type="button"
                      aria-label={`ยกเลิกรายการ ${i.description}`}
                      title="ยกเลิกรายการ (ตีเป็นโมฆะ)"
                      onClick={() => {
                        if (voidingId === i.id) {
                          setVoidingId(null);
                        } else {
                          setVoidingId(i.id);
                          setVoidReason("");
                        }
                      }}
                      className="rounded-sm p-1 text-fg-subtle transition-colors hover:bg-danger-soft hover:text-danger-strong"
                    >
                      <X size={15} />
                    </button>
                  ) : (
                    <span className="w-5.75" />
                  ))}
              </div>
            </li>
          );
        })}
      </ul>

      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="เพิ่มรายการค่าใช้จ่าย"
        description="กรอกได้หลายรายการแล้วบันทึกทีเดียว · VAT/ค่าบริการคิดตามตั้งค่าสาขาอัตโนมัติ"
        maxWidth={560}
      >
        <div className="space-y-3">
          {rows.map((r, idx) => (
            <div
              key={r.key}
              className={idx > 0 ? "border-t border-border pt-3" : undefined}
            >
              {/* layout ตามที่เจ้าของวาด: หมวด|รายละเอียด / จำนวน|ราคา (2026-07-22) */}
              <div className="grid grid-cols-[8.5rem_1fr_auto] items-end gap-2">
                <Field label={idx === 0 ? "หมวด" : undefined}>
                  <Select
                    value={r.category}
                    onChange={(v) => patchRow(r.key, { category: v })}
                    options={[...ADD_OPTIONS]}
                    className="w-full"
                  />
                </Field>
                <Field label={idx === 0 ? "รายละเอียด" : undefined}>
                  <Input
                    value={r.description}
                    onChange={(e) => patchRow(r.key, { description: e.target.value })}
                    placeholder={DESC_PLACEHOLDER[r.category]}
                    className="w-full"
                  />
                </Field>
                {rows.length > 1 ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`ลบแถวที่ ${idx + 1}`}
                    onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                  >
                    <X size={15} />
                  </Button>
                ) : (
                  <span />
                )}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Field label={idx === 0 ? "จำนวน" : undefined}>
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    value={r.qty}
                    onChange={(e) => patchRow(r.key, { qty: e.target.value })}
                    className="w-full"
                  />
                </Field>
                <Field label={idx === 0 ? "ราคา/หน่วย (บาท)" : undefined}>
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={r.unitPrice}
                    onChange={(e) => patchRow(r.key, { unitPrice: e.target.value })}
                    className="w-full"
                  />
                </Field>
              </div>
            </div>
          ))}

          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              setRows((rs) => [...rs, { ...emptyRow(Date.now()), category: rs[rs.length - 1]?.category ?? "food" }])
            }
          >
            <Plus size={15} className="mr-1" />
            เพิ่มแถว
          </Button>

          <div className="flex items-center justify-between border-t border-border pt-3">
            <span className="text-base text-fg-muted">
              {filled.length > 0 && (
                <>
                  รวม {filled.length} รายการ ·{" "}
                  <span className="font-medium tabular-nums text-fg">{baht(draftTotal)}฿</span>
                </>
              )}
            </span>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setAdding(false)}>
                ยกเลิก
              </Button>
              <Button disabled={saving || filled.length === 0} onClick={onAdd}>
                {saving
                  ? "กำลังบันทึก…"
                  : filled.length > 1
                    ? `บันทึก ${filled.length} รายการ`
                    : "บันทึก"}
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
