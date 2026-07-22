"use client";

import { useMemo, useState } from "react";
import { Plus, Pencil, CalendarRange, Tag } from "lucide-react";
import {
  Field,
  Input,
  Select,
  Button,
  Modal,
  DateRangePicker,
  type DateRange,
  useToast,
} from "@/components/ui";
import { isNextControlFlowError } from "@/lib/next-error";
import { createRatePlan, setBasePrice, setSeasonPrices } from "./actions";

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
      if (isNextControlFlowError(e)) throw e; // ปล่อย redirect/notFound ให้ Next
      toast.err(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    } finally {
      setPending(false);
    }
  }
  return { onSubmit, pending };
}

// ช่องราคาใหญ่ (พระเอกของ modal ราคา)
function BigPriceInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <Input
        type="number"
        name="price"
        required
        min={0}
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        className="h-14 w-full pr-14 text-right text-2xl! font-semibold tabular-nums"
      />
      <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-base text-fg-subtle">
        ฿/คืน
      </span>
    </div>
  );
}

/* ── ราคาปกติ (ไม่ผูกวัน) ───────────────────────────────────────────────────── */

export function BasePriceModalButton({
  hotelSlug,
  roomTypeId,
  roomTypeName,
  ratePlanId,
  currentBaht,
}: {
  hotelSlug: string;
  roomTypeId: string;
  roomTypeName: string;
  ratePlanId: string;
  /** ราคาปกติปัจจุบัน (บาท) — null = ยังไม่ตั้ง */
  currentBaht: number | null;
}) {
  const [open, setOpen] = useState(false);
  const isNew = currentBaht == null;
  return (
    <>
      <Button
        variant={isNew ? "primary" : "ghost"}
        size="sm"
        onClick={() => setOpen(true)}
        aria-label={isNew ? undefined : `แก้ราคาปกติ ${roomTypeName}`}
        title={isNew ? undefined : "แก้ราคาปกติ"}
      >
        {isNew ? (
          <>
            <Plus size={15} className="mr-1" />
            ตั้งราคาปกติ
          </>
        ) : (
          <Pencil size={15} />
        )}
      </Button>
      {open && (
        <BasePriceModal
          hotelSlug={hotelSlug}
          roomTypeId={roomTypeId}
          roomTypeName={roomTypeName}
          ratePlanId={ratePlanId}
          currentBaht={currentBaht}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function BasePriceModal({
  hotelSlug,
  roomTypeId,
  roomTypeName,
  ratePlanId,
  currentBaht,
  onClose,
}: {
  hotelSlug: string;
  roomTypeId: string;
  roomTypeName: string;
  ratePlanId: string;
  currentBaht: number | null;
  onClose: () => void;
}) {
  const { onSubmit, pending } = useSubmit(setBasePrice, "ตั้งราคาปกติแล้ว", onClose);
  const [price, setPrice] = useState(currentBaht != null ? String(currentBaht) : "");
  const valid = Number(price) > 0;

  return (
    <Modal
      open
      onClose={onClose}
      title={`ราคาปกติ — ${roomTypeName}`}
      description="ราคายืนพื้นทุกคืน ตั้งครั้งเดียวจบ ไม่มีวันหมดอายุ — ช่วงที่อยากขายแพง/ถูกกว่านี้ ค่อยเพิ่ม “ช่วงราคาพิเศษ” ทับทีหลัง"
      maxWidth={420}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            ยกเลิก
          </Button>
          <Button type="submit" form="base-price-form" disabled={pending || !valid}>
            {pending ? "กำลังบันทึก…" : "บันทึกราคาปกติ"}
          </Button>
        </>
      }
    >
      <form id="base-price-form" action={onSubmit} className="space-y-4">
        <input type="hidden" name="hotelSlug" value={hotelSlug} />
        <input type="hidden" name="ratePlanId" value={ratePlanId} />
        <input type="hidden" name="roomTypeId" value={roomTypeId} />
        <Field label="ราคาต่อคืน (บาท)">
          <BigPriceInput value={price} onChange={setPrice} />
        </Field>
      </form>
    </Modal>
  );
}

/* ── ช่วงราคาพิเศษ (season) — ตั้งจาก "ช่วงเวลา" ใส่ราคาทุกประเภทห้องหน้าเดียว ── */

type SeasonRoomType = { id: string; name: string };
type SeasonBase = { room_type_id: string; rate_plan_id: string; baht: number };

/* ปุ่มเดียว "เพิ่มราคา" → เลือกประเภทก่อน (เจ้าของเสนอ 2026-07-17 — 2 ปุ่มแยกแล้วงง)
 * ตัวเลือกอธิบายตัวเอง: ราคาตามช่วงเวลา (season) vs แพ็กเกจราคา (ขายแบบมีเงื่อนไข) */
export function AddPriceButton({
  hotelSlug,
  propertyId,
  roomTypes,
  ratePlans,
  basePrices,
}: {
  hotelSlug: string;
  propertyId: string;
  roomTypes: SeasonRoomType[];
  ratePlans: { id: string; name: string }[];
  basePrices: SeasonBase[];
}) {
  const [step, setStep] = useState<null | "choose" | "season" | "plan">(null);
  const close = () => setStep(null);

  return (
    <>
      <Button onClick={() => setStep("choose")}>
        <Plus size={16} className="mr-1.5" />
        เพิ่มราคา
      </Button>

      {step === "choose" && (
        <Modal
          open
          onClose={close}
          title="จะเพิ่มราคาแบบไหน?"
          maxWidth={480}
        >
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setStep("season")}
              className="flex w-full items-start gap-3 rounded-(--radius) border border-border p-4 text-left transition-colors hover:border-brand hover:bg-brand-soft/30"
            >
              <CalendarRange size={22} className="mt-0.5 shrink-0 text-brand" />
              <span>
                <span className="block text-base font-semibold text-fg">
                  ราคาตามช่วงเวลา
                </span>
                <span className="mt-0.5 block text-sm text-fg-muted">
                  ตั้งราคาแพง/ถูกกว่าปกติเฉพาะช่วงวัน เช่น ปีใหม่ สงกรานต์ high season —
                  พ้นช่วงกลับไปราคาปกติเอง
                </span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => setStep("plan")}
              className="flex w-full items-start gap-3 rounded-(--radius) border border-border p-4 text-left transition-colors hover:border-brand hover:bg-brand-soft/30"
            >
              <Tag size={22} className="mt-0.5 shrink-0 text-brand" />
              <span>
                <span className="block text-base font-semibold text-fg">
                  แพ็กเกจราคา (ขายแบบมีเงื่อนไข)
                </span>
                <span className="mt-0.5 block text-sm text-fg-muted">
                  ขายห้องเดิมอีกเงื่อนไขให้แขกเลือก เช่น ไม่คืนเงินแต่ถูกกว่า ·
                  รวมอาหารเช้า — ส่วนใหญ่ไม่จำเป็น ขายเงื่อนไขเดียวก็พอ
                </span>
              </span>
            </button>
          </div>
        </Modal>
      )}

      {step === "season" && (
        <SeasonModal
          hotelSlug={hotelSlug}
          roomTypes={roomTypes}
          ratePlans={ratePlans}
          basePrices={basePrices}
          onClose={close}
        />
      )}
      {step === "plan" && (
        <RatePlanModal hotelSlug={hotelSlug} propertyId={propertyId} onClose={close} />
      )}
    </>
  );
}

function SeasonModal({
  hotelSlug,
  roomTypes,
  ratePlans,
  basePrices,
  onClose,
}: {
  hotelSlug: string;
  roomTypes: SeasonRoomType[];
  ratePlans: { id: string; name: string }[];
  basePrices: SeasonBase[];
  onClose: () => void;
}) {
  const { onSubmit, pending } = useSubmit(
    setSeasonPrices,
    "เพิ่มช่วงราคาพิเศษแล้ว",
    onClose,
  );
  const [range, setRange] = useState<DateRange | null>(null); // ช่วงพิเศษ = ต้องเลือกเอง
  const [ratePlanId, setRatePlanId] = useState(ratePlans[0]?.id ?? "");
  const [prices, setPrices] = useState<Record<string, string>>({});
  const multiPlan = ratePlans.length > 1;

  const nights = useMemo(() => {
    if (!range) return 0;
    const a = new Date(range.from + "T00:00:00Z");
    const b = new Date(range.to + "T00:00:00Z");
    const n = Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [range]);

  // ราคาปกติอ้างอิง ตามแพ็กเกจที่เลือกอยู่
  const baseOf = (roomTypeId: string) =>
    basePrices.find((b) => b.room_type_id === roomTypeId && b.rate_plan_id === ratePlanId)
      ?.baht ?? null;

  const filled = roomTypes.filter((rt) => Number(prices[rt.id]) > 0);
  const valid = nights > 0 && filled.length > 0;

  return (
    <Modal
      open
      onClose={onClose}
      title="เพิ่มช่วงราคาพิเศษ"
      description="เลือกช่วงวัน (เช่น ปีใหม่ / high season) แล้วใส่ราคาทับเฉพาะห้องที่ราคาเปลี่ยน — ห้องที่เว้นว่างใช้ราคาปกติเหมือนเดิม"
      maxWidth={560}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            ยกเลิก
          </Button>
          <Button type="submit" form="season-form" disabled={pending || !valid}>
            {pending
              ? "กำลังบันทึก…"
              : valid
                ? `ตั้งราคา ${filled.length} ประเภทห้อง × ${nights.toLocaleString()} คืน`
                : "เพิ่มช่วงราคาพิเศษ"}
          </Button>
        </>
      }
    >
      <form id="season-form" action={onSubmit} className="space-y-4">
        <input type="hidden" name="hotelSlug" value={hotelSlug} />
        <input type="hidden" name="ratePlanId" value={ratePlanId} />

        <Field label="ช่วงวันที่ (คืนแรก – คืนสุดท้าย)">
          <DateRangePicker
            mode="range"
            value={range}
            onChange={setRange}
            placeholder="เลือกช่วงวัน เช่น 30 ธ.ค. – 2 ม.ค."
            className="w-full"
          />
          <input type="hidden" name="from" value={range?.from ?? ""} />
          <input type="hidden" name="to" value={range?.to ?? ""} />
        </Field>

        {multiPlan && (
          <Field label="แพ็กเกจราคา">
            <Select
              value={ratePlanId}
              onChange={setRatePlanId}
              className="w-full"
              options={ratePlans.map((r) => ({ value: r.id, label: r.name }))}
            />
          </Field>
        )}

        {/* ตารางราคา — แถวละประเภทห้อง ใส่ได้หน้าเดียวจบ */}
        <div>
          <p className="mb-1.5 text-base font-medium text-fg">ราคาช่วงนี้ (บาท/คืน)</p>
          <ul className="divide-y divide-border overflow-hidden rounded-(--radius) border border-border">
            {roomTypes.map((rt) => (
              <li
                key={rt.id}
                className="flex items-center justify-between gap-3 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-base font-medium text-fg">{rt.name}</div>
                  <div className="text-sm text-fg-subtle">
                    {baseOf(rt.id) != null
                      ? `ปกติ ${baseOf(rt.id)!.toLocaleString()}฿`
                      : "ยังไม่ตั้งราคาปกติ"}
                  </div>
                </div>
                <div className="relative w-36 shrink-0">
                  <Input
                    type="number"
                    name={`price__${rt.id}`}
                    min={0}
                    value={prices[rt.id] ?? ""}
                    onChange={(e) =>
                      setPrices((p) => ({ ...p, [rt.id]: e.target.value }))
                    }
                    placeholder="—"
                    className="w-full pr-8 text-right tabular-nums"
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-fg-subtle">
                    ฿
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <Field
          label="พักขั้นต่ำ (คืน)"
          hint={
            <>
              บังคับจำนวนคืนขั้นต่ำต่อการจองในช่วงนี้ — เช่นปีใหม่ต้องพักอย่างน้อย 2 คืน ·
              ปกติใส่ 1 · ใช้กับทุกห้องที่กรอกราคา
            </>
          }
        >
          <Input type="number" name="min_stay" defaultValue={1} min={1} className="w-28" />
        </Field>
      </form>
    </Modal>
  );
}

/* ── แพ็กเกจราคา (rate plan) ────────────────────────────────────────────────── */

function RatePlanModal({
  hotelSlug,
  propertyId,
  onClose,
}: {
  hotelSlug: string;
  propertyId: string;
  onClose: () => void;
}) {
  const { onSubmit, pending } = useSubmit(createRatePlan, "เพิ่มแพ็กเกจราคาแล้ว", onClose);
  const [depType, setDepType] = useState("none");
  const [cancelType, setCancelType] = useState("free_until");

  return (
    <Modal
      open
      onClose={onClose}
      title="เพิ่มแพ็กเกจราคา"
      description="ขายห้องเดิมอีกเงื่อนไข ราคาแยกกัน — เช่น Non-refundable ถูกกว่าปกติแต่ยกเลิกไม่ได้ · ถ้าขายเงื่อนไขเดียวอยู่ ไม่ต้องเพิ่ม"
      maxWidth={520}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            ยกเลิก
          </Button>
          <Button type="submit" form="rate-plan-form" disabled={pending}>
            {pending ? "กำลังบันทึก…" : "เพิ่มแพ็กเกจราคา"}
          </Button>
        </>
      }
    >
      <form id="rate-plan-form" action={onSubmit} className="grid grid-cols-2 gap-3">
        <input type="hidden" name="hotelSlug" value={hotelSlug} />
        <input type="hidden" name="propertyId" value={propertyId} />

        <Field label="ชื่อแพ็กเกจ" className="col-span-2">
          <Input name="name" required placeholder="เช่น Non-refundable, รวมอาหารเช้า" autoFocus />
        </Field>

        {/* ช่องตัวเลขโชว์เฉพาะตอนที่เกี่ยว — ไม่ disable ค้างให้ layout เบี้ยว */}
        <Field
          label="มัดจำตอนจอง"
          className={depType === "percent" || depType === "fixed" ? undefined : "col-span-2"}
        >
          <Select
            name="deposit_type"
            value={depType}
            onChange={setDepType}
            className="w-full"
            options={[
              { value: "none", label: "ไม่เก็บ (จ่ายที่โรงแรม)" },
              { value: "first_night", label: "คืนแรก" },
              { value: "percent", label: "เปอร์เซ็นต์" },
              { value: "fixed", label: "จำนวนเงินคงที่" },
              { value: "full", label: "เต็มจำนวน" },
            ]}
          />
        </Field>
        {(depType === "percent" || depType === "fixed") && (
          <Field label={depType === "percent" ? "กี่ %" : "กี่บาท"}>
            <Input type="number" name="deposit_value" defaultValue={0} className="w-full" />
          </Field>
        )}

        <Field
          label="นโยบายยกเลิก"
          className={cancelType === "free_until" ? undefined : "col-span-2"}
        >
          <Select
            name="cancel_type"
            value={cancelType}
            onChange={setCancelType}
            className="w-full"
            options={[
              { value: "free_until", label: "ยกเลิกฟรีก่อนเข้าพัก N วัน" },
              { value: "non_refundable", label: "ไม่คืนเงิน" },
            ]}
          />
        </Field>
        {cancelType === "free_until" && (
          <Field label="กี่วัน">
            <Input type="number" name="cancel_days" defaultValue={1} className="w-full" />
          </Field>
        )}

        <label className="col-span-2 flex items-center gap-2 text-base text-fg">
          <input type="checkbox" name="include_breakfast" /> ราคานี้รวมอาหารเช้า
        </label>
      </form>
    </Modal>
  );
}
