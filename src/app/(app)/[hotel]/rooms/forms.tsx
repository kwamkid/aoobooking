"use client";

import { useMemo, useState } from "react";
import { Plus, Check, AlertTriangle, X, Pencil } from "lucide-react";
import { Field, Input, Textarea, Button, Modal, useToast, useConfirm } from "@/components/ui";
import { isNextControlFlowError } from "@/lib/next-error";
import { parseRoomNumbers } from "@/lib/hotel/room-numbers";
import {
  createRoomType,
  updateRoomType,
  deleteRoomType,
  createRoom,
  deleteRoom,
} from "./actions";

// submit + toast + ปิด modal เมื่อสำเร็จ (โยน error ต่อไม่ได้ → toast แทน)
// สำคัญ: redirect()/notFound() ของ Next ทำงานโดย "throw error พิเศษ" ให้ framework จับ
// → ต้อง re-throw ออกไป ไม่งั้น catch เราจะกลืนมันแล้วโชว์ "NEXT_REDIRECT" เป็น toast
// (bugs.md §Server Actions)
function useSubmit(
  action: (fd: FormData) => Promise<void>,
  successMsg: string,
  onSuccess?: () => void,
) {
  const toast = useToast();
  const [pending, setPending] = useState(false);

  async function onSubmit(fd: FormData) {
    setPending(true);
    try {
      await action(fd);
      toast.ok(successMsg);
      onSuccess?.();
    } catch (e) {
      if (isNextControlFlowError(e)) throw e; // ปล่อยให้ Next จัดการ navigation
      toast.err(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    } finally {
      setPending(false);
    }
  }
  return { onSubmit, pending };
}

/* ── ประเภทห้อง ────────────────────────────────────────────────────────────── */

export type RoomTypeData = {
  id: string;
  name: string;
  base_occupancy: number;
  max_occupancy: number;
  extra_adult_satang: number;
  extra_child_satang: number;
  child_age_limit: number;
  monthly_rent_satang: number | null;
};

// ปุ่ม "แก้ไข" ประเภทห้อง → modal เดียวกับตอนสร้าง (พร้อมปุ่มลบใน modal)
export function RoomTypeEditButton({
  hotelSlug,
  propertyId,
  roomType,
}: {
  hotelSlug: string;
  propertyId: string;
  roomType: RoomTypeData;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {/* อยู่ใน <summary> ของ details — ต้อง preventDefault กันการ์ดพับ/กางตอนกด */}
      <Button
        variant="ghost"
        size="sm"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <Pencil size={14} className="mr-1" />
        แก้ไข
      </Button>
      {open && (
        <RoomTypeModal
          hotelSlug={hotelSlug}
          propertyId={propertyId}
          roomType={roomType}
          open
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

// ปุ่ม "เพิ่มประเภทห้อง" → เปิด modal (ใช้ Modal shared component)
export function RoomTypeModalButton({
  hotelSlug,
  propertyId,
  variant = "primary",
  label = "เพิ่มประเภทห้อง",
}: {
  hotelSlug: string;
  propertyId: string;
  variant?: "primary" | "secondary";
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        <Plus size={17} className="mr-1.5" />
        {label}
      </Button>
      <RoomTypeModal
        hotelSlug={hotelSlug}
        propertyId={propertyId}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

function RoomTypeModal({
  hotelSlug,
  propertyId,
  roomType,
  open,
  onClose,
}: {
  hotelSlug: string;
  propertyId: string;
  /** ส่งมา = โหมดแก้ไข (ไม่ส่ง = สร้างใหม่) */
  roomType?: RoomTypeData;
  open: boolean;
  onClose: () => void;
}) {
  const isEdit = !!roomType;
  const { onSubmit, pending } = useSubmit(
    isEdit ? updateRoomType : createRoomType,
    isEdit ? "บันทึกประเภทห้องแล้ว" : "เพิ่มประเภทห้องแล้ว",
    onClose,
  );
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [deleting, setDeleting] = useState(false);

  async function onDelete() {
    if (!roomType) return;
    const ok = await confirm({
      title: `ลบประเภทห้อง "${roomType.name}"?`,
      description: "ต้องไม่มีห้อง/การจองในอนาคตผูกอยู่ · ราคาที่ตั้งไว้จะหายจากหน้าราคา",
      tone: "danger",
      confirmLabel: "ลบประเภทห้อง",
    });
    if (!ok) return;
    setDeleting(true);
    try {
      const fd = new FormData();
      fd.set("hotelSlug", hotelSlug);
      fd.set("roomTypeId", roomType.id);
      await deleteRoomType(fd);
      toast.ok(`ลบประเภทห้อง "${roomType.name}" แล้ว`);
      onClose();
    } catch (e) {
      if (isNextControlFlowError(e)) throw e;
      toast.err(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? `แก้ไข — ${roomType.name}` : "เพิ่มประเภทห้อง"}
      description="กลุ่มห้องที่ขายราคาเดียวกัน เช่น Deluxe, Superior"
      maxWidth={560}
      footer={
        <>
          {isEdit && (
            <span className="mr-auto">
              <Button
                variant="ghost"
                size="sm"
                onClick={onDelete}
                disabled={pending || deleting}
                className="text-danger-strong"
              >
                {deleting ? "กำลังลบ…" : "ลบประเภทห้อง"}
              </Button>
            </span>
          )}
          <Button variant="ghost" onClick={onClose} disabled={pending || deleting}>
            ยกเลิก
          </Button>
          <Button type="submit" form="room-type-form" disabled={pending || deleting}>
            {pending ? "กำลังบันทึก…" : isEdit ? "บันทึก" : "เพิ่มประเภทห้อง"}
          </Button>
        </>
      }
    >
      {dialog}
      {/* form อยู่ใน body · ปุ่ม submit อยู่ footer → ผูกด้วย form="room-type-form" */}
      <form id="room-type-form" action={onSubmit} className="space-y-4">
        <input type="hidden" name="hotelSlug" value={hotelSlug} />
        <input type="hidden" name="propertyId" value={propertyId} />
        {isEdit && <input type="hidden" name="roomTypeId" value={roomType.id} />}

        <Field label="ชื่อประเภทห้อง">
          <Input
            name="name"
            required
            placeholder="เช่น Deluxe, Superior, Suite"
            defaultValue={roomType?.name}
          />
        </Field>

        <div>
          <p className="mb-1.5 text-base font-medium text-fg">จำนวนผู้เข้าพัก</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Field
              label="พักปกติ (คน)"
              hint={
                <>
                  จำนวนคนที่<strong className="text-fg">ราคารวมอยู่แล้ว</strong> — พักไม่เกินนี้
                  จ่ายแค่ราคาห้อง
                  <br />
                  <br />
                  เช่น ตั้ง 2 → พัก 2 คนจ่าย 1,000฿ · คนที่ 3 ถึงเริ่มคิดค่าเสริม
                </>
              }
            >
              <Input type="number" name="base_occupancy" defaultValue={roomType?.base_occupancy ?? 2} min={1} />
            </Field>
            <Field
              label="พักได้สูงสุด (คน)"
              hint={
                <>
                  <strong className="text-fg">เพดานคน</strong>ที่ห้องนี้รับได้ (นับผู้ใหญ่ + เด็ก)
                  <br />
                  <br />
                  เกินจำนวนนี้ = จองไม่ได้เลย · ต้อง ≥ &quot;พักปกติ&quot;
                </>
              }
            >
              <Input type="number" name="max_occupancy" defaultValue={roomType?.max_occupancy ?? 2} min={1} />
            </Field>
            <Field
              label="เด็กอายุไม่เกิน (ปี)"
              hint={
                <>
                  เกณฑ์ว่าอายุเท่าไหร่ยังนับเป็น <strong className="text-fg">&quot;เด็ก&quot;</strong>{" "}
                  — เกินกว่านี้คิดเป็นผู้ใหญ่
                  <br />
                  <br />
                  ใช้บอกลูกค้า/พนักงานตอนจอง · จะบังคับใช้อัตโนมัติเมื่อเปิดหน้าจองออนไลน์
                </>
              }
            >
              <Input type="number" name="child_age_limit" defaultValue={roomType?.child_age_limit ?? 12} min={0} />
            </Field>
          </div>
        </div>

        <Field
          label="ราคาเช่ารายเดือน (บาท/เดือน)"
          hint={
            <>
              ใส่ = เปิดให้ห้องประเภทนี้<strong className="text-fg">ปล่อยเช่ารายเดือน</strong>ได้
              (โมดูลเสริม) · เว้นว่าง = ขายรายวันอย่างเดียว · ห้องที่มีผู้เช่าจะถูกกันออกจาก
              การขายรายวันอัตโนมัติ
            </>
          }
        >
          <Input
            type="number"
            name="monthly_rent"
            min={0}
            placeholder="เว้นว่าง = ไม่เปิดรายเดือน"
            defaultValue={
              roomType?.monthly_rent_satang != null
                ? roomType.monthly_rent_satang / 100
                : undefined
            }
            className="w-56 text-right tabular-nums"
          />
        </Field>

        <div>
          <p className="mb-1.5 text-base font-medium text-fg">
            ค่าเสริมเมื่อพักเกินจำนวนปกติ{" "}
            <span className="font-normal text-fg-subtle">(บาท/คน/คืน · 0 = ไม่คิด)</span>
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Field
              label="ผู้ใหญ่เพิ่ม 1 คน"
              hint={
                <>
                  คิดเฉพาะ<strong className="text-fg">คนที่เกิน &quot;พักปกติ&quot;</strong>{" "}
                  คิดต่อคนต่อคืน
                  <br />
                  <br />
                  ห้อง 1,000฿ · พักปกติ 2 · ค่าเสริม 500฿
                  <br />
                  → 3 ผู้ใหญ่ = 1,000 + 500 = <strong className="text-fg">1,500฿/คืน</strong>
                </>
              }
            >
              <Input type="number" name="extra_adult" defaultValue={roomType ? roomType.extra_adult_satang / 100 : 0} min={0} />
            </Field>
            <Field
              label="เด็กเพิ่ม 1 คน"
              hint={
                <>
                  เด็ก<strong className="text-fg">นับรวมกับผู้ใหญ่</strong> —
                  คิดเฉพาะคนที่ทำให้เกิน &quot;พักปกติ&quot;
                  <br />
                  <br />
                  พักปกติ 2 · เด็กเสริม 300฿
                  <br />
                  → 1 ผู้ใหญ่ + 1 เด็ก (รวม 2) = <strong className="text-fg">ไม่คิดเพิ่ม</strong>
                  <br />
                  → 2 ผู้ใหญ่ + 1 เด็ก (รวม 3) = <strong className="text-fg">+300฿</strong>
                </>
              }
            >
              <Input type="number" name="extra_child" defaultValue={roomType ? roomType.extra_child_satang / 100 : 0} min={0} />
            </Field>
          </div>
        </div>
      </form>
    </Modal>
  );
}

/* ── ห้อง ──────────────────────────────────────────────────────────────────── */

// ปุ่ม "+ เพิ่มห้อง" ต่อประเภทห้อง → เปิด modal
export function RoomModalButton({
  hotelSlug,
  propertyId,
  roomTypeId,
  roomTypeName,
  existingNumbers,
}: {
  hotelSlug: string;
  propertyId: string;
  roomTypeId: string;
  roomTypeName: string;
  existingNumbers: string[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Plus size={16} className="mr-1" />
        เพิ่มห้อง
      </Button>
      <RoomModal
        hotelSlug={hotelSlug}
        propertyId={propertyId}
        roomTypeId={roomTypeId}
        roomTypeName={roomTypeName}
        existingNumbers={existingNumbers}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

function RoomModal({
  hotelSlug,
  propertyId,
  roomTypeId,
  roomTypeName,
  existingNumbers,
  open,
  onClose,
}: {
  hotelSlug: string;
  propertyId: string;
  roomTypeId: string;
  roomTypeName: string;
  existingNumbers: string[];
  open: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [text, setText] = useState("");

  // preview สด — parse ทุกครั้งที่พิมพ์ + แยกว่าอันไหนใหม่ / อันไหนซ้ำของเดิม
  // (server เช็คซ้ำอีกชั้นใน RPC เสมอ — อันนี้แค่ให้เห็นก่อนกด)
  const preview = useMemo(() => {
    if (!text.trim()) return null;
    const parsed = parseRoomNumbers(text);
    if (!parsed.ok) return parsed;

    const taken = new Set(existingNumbers);
    return {
      ok: true as const,
      fresh: parsed.rooms.filter((r) => !taken.has(r)),
      dupes: parsed.rooms.filter((r) => taken.has(r)),
    };
  }, [text, existingNumbers]);

  const canSubmit = preview?.ok === true && preview.fresh.length > 0;

  async function onSubmit(fd: FormData) {
    setPending(true);
    try {
      const { added, skipped, restored } = await createRoom(fd);
      const notes = [
        restored > 0 ? `กู้คืน ${restored} ห้องที่เคยลบ` : null,
        skipped.length > 0
          ? `ข้าม ${skipped.length} ห้องที่มีอยู่แล้ว (${skipped.join(", ")})`
          : null,
      ].filter(Boolean);
      toast.ok(
        notes.length > 0
          ? `เพิ่ม ${added} ห้องแล้ว · ${notes.join(" · ")}`
          : `เพิ่ม ${added} ห้องแล้ว`,
      );
      setText("");
      onClose();
    } catch (e) {
      if (isNextControlFlowError(e)) throw e;
      toast.err(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="เพิ่มห้อง"
      description={`ห้องในประเภท "${roomTypeName}"`}
      maxWidth={560}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            ยกเลิก
          </Button>
          <Button type="submit" form="room-form" disabled={pending || !canSubmit}>
            {pending
              ? "กำลังบันทึก…"
              : canSubmit
                ? `เพิ่ม ${preview.fresh.length} ห้อง`
                : "เพิ่มห้อง"}
          </Button>
        </>
      }
    >
      <form id="room-form" action={onSubmit} className="space-y-4">
        <input type="hidden" name="hotelSlug" value={hotelSlug} />
        <input type="hidden" name="propertyId" value={propertyId} />
        <input type="hidden" name="roomTypeId" value={roomTypeId} />

        <Field
          label="เลขห้อง"
          hint={
            <>
              ใส่ได้หลายห้องพร้อมกัน — ผสมกันได้
              <br />
              <br />
              <strong className="text-fg">101, 102, 105</strong> → ทีละห้อง
              <br />
              <strong className="text-fg">101-110</strong> → ทั้งช่วง (10 ห้อง)
              <br />
              <strong className="text-fg">101-105, 201</strong> → ผสม
              <br />
              <strong className="text-fg">A1-A5</strong> → มีตัวอักษรนำหน้า
            </>
          }
        >
          <Textarea
            name="room_number"
            required
            autoFocus
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="เช่น 101, 102, 105 หรือ 101-110"
          />
        </Field>

        {/* preview — ยืนยันก่อนกดบันทึกว่าอันไหนเพิ่มใหม่ / อันไหนซ้ำของเดิม */}
        {preview && !preview.ok && (
          <p className="rounded-(--radius) border border-danger/40 bg-danger-soft p-3 text-sm text-danger-strong">
            {preview.error}
          </p>
        )}

        {preview?.ok && (
          <div className="space-y-3 rounded-(--radius) border border-border bg-bg-subtle p-3">
            {/* ห้องใหม่ */}
            {preview.fresh.length > 0 && (
              <div>
                <p className="flex items-center gap-1.5 text-base font-medium text-success-strong">
                  <Check size={15} strokeWidth={3} />
                  จะเพิ่ม {preview.fresh.length} ห้อง
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {preview.fresh.slice(0, 40).map((r) => (
                    <span
                      key={r}
                      className="rounded border border-success/40 bg-success-soft px-1.5 py-0.5 text-sm text-success-strong"
                    >
                      {r}
                    </span>
                  ))}
                  {preview.fresh.length > 40 && (
                    <span className="px-1 py-0.5 text-sm text-fg-muted">
                      … อีก {preview.fresh.length - 40} ห้อง
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* ห้องซ้ำ — บอกว่าจะถูกข้าม */}
            {preview.dupes.length > 0 && (
              <div>
                <p className="flex items-center gap-1.5 text-base font-medium text-warning-strong">
                  <AlertTriangle size={15} />
                  มีอยู่แล้ว {preview.dupes.length} ห้อง — จะถูกข้าม
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {preview.dupes.slice(0, 40).map((r) => (
                    <span
                      key={r}
                      className="rounded border border-border bg-bg px-1.5 py-0.5 text-sm text-fg-subtle line-through"
                    >
                      {r}
                    </span>
                  ))}
                  {preview.dupes.length > 40 && (
                    <span className="px-1 py-0.5 text-sm text-fg-muted">
                      … อีก {preview.dupes.length - 40} ห้อง
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* ซ้ำทั้งหมด = ไม่มีอะไรให้เพิ่ม */}
            {preview.fresh.length === 0 && (
              <p className="text-base text-fg-muted">
                ทุกห้องที่ใส่มามีอยู่แล้ว — เปลี่ยนเลขห้องหรือปิดหน้าต่างนี้
              </p>
            )}
          </div>
        )}

        <Field label="ชั้น" hint="ใส่ครั้งเดียว ใช้กับทุกห้องที่เพิ่มรอบนี้ (เว้นว่างได้)">
          <Input name="floor" placeholder="เช่น 1" />
        </Field>
      </form>
    </Modal>
  );
}

/* ── รายการห้องใน card (chip + ลบแบบมี confirm) ─────────────────────────────── */

export function RoomChips({
  hotelSlug,
  rooms,
  canEdit,
}: {
  hotelSlug: string;
  rooms: { id: string; room_number: string; floor: string | null }[];
  canEdit: boolean;
}) {
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [deleting, setDeleting] = useState<string | null>(null);

  async function onDelete(room: { id: string; room_number: string }) {
    const ok = await confirm({
      title: `ลบห้อง ${room.room_number}?`,
      description: "ห้องจะถูกซ่อนจากระบบ (เพิ่มเลขเดิมกลับมาได้ภายหลัง)",
      tone: "danger",
      confirmLabel: "ลบห้อง",
    });
    if (!ok) return;
    setDeleting(room.id);
    try {
      const fd = new FormData();
      fd.set("hotelSlug", hotelSlug);
      fd.set("roomId", room.id);
      await deleteRoom(fd);
      toast.ok(`ลบห้อง ${room.room_number} แล้ว`);
    } catch (e) {
      if (isNextControlFlowError(e)) throw e;
      toast.err(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    } finally {
      setDeleting(null);
    }
  }

  if (rooms.length === 0) {
    return <p className="text-base text-fg-subtle">ยังไม่มีห้องในประเภทนี้</p>;
  }

  // จัดกลุ่มตามชั้น — เรียงเลขชั้นแบบตัวเลข · ไม่ระบุชั้นไว้ท้าย
  // มีกลุ่มเดียวและไม่ระบุชั้น = ไม่ต้องโชว์หัวข้อชั้น (โรงแรมที่ไม่ใช้ชั้น)
  const groups = new Map<string, typeof rooms>();
  for (const r of rooms) {
    const key = r.floor?.trim() || "";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }
  const floorKeys = [...groups.keys()].sort((a, b) => {
    if (a === "") return 1;
    if (b === "") return -1;
    return a.localeCompare(b, "th", { numeric: true });
  });
  const showFloorLabel = !(floorKeys.length === 1 && floorKeys[0] === "");

  const chip = (r: (typeof rooms)[number]) => (
    <span
      key={r.id}
      className={`inline-flex items-center gap-1.5 rounded-(--radius) border border-border bg-bg px-2.5 py-1 text-base text-fg ${
        deleting === r.id ? "opacity-40" : ""
      }`}
    >
      <span className="font-medium tabular-nums">{r.room_number}</span>
      {canEdit && (
        <button
          type="button"
          onClick={() => onDelete(r)}
          disabled={deleting === r.id}
          aria-label={`ลบห้อง ${r.room_number}`}
          className="-mr-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-fg-subtle transition-colors hover:bg-danger-soft hover:text-danger-strong"
        >
          <X size={13} />
        </button>
      )}
    </span>
  );

  return (
    <>
      {dialog}
      <div className="space-y-2">
        {floorKeys.map((fk) => (
          <div key={fk || "no-floor"} className="flex items-start gap-3">
            {showFloorLabel && (
              <span className="w-24 shrink-0 pt-1.5 text-sm font-medium text-fg-muted">
                {fk ? `ชั้น ${fk}` : "ไม่ระบุชั้น"}{" "}
                <span className="font-normal text-fg-subtle">
                  ({groups.get(fk)!.length})
                </span>
              </span>
            )}
            <div className="flex flex-wrap gap-1.5">{groups.get(fk)!.map(chip)}</div>
          </div>
        ))}
      </div>
    </>
  );
}
