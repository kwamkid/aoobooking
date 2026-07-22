"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Baby,
  BedDouble,
  Check,
  ChevronLeft,
  Minus,
  Plus,
  Search,
  User,
  Users,
  X,
} from "lucide-react";
import {
  Badge,
  Button,
  DateRangePicker,
  Field,
  Input,
  Select,
  useToast,
  type DateRange,
} from "@/components/ui";
import { hotelHref } from "@/lib/hotel/href";
import { isNextControlFlowError } from "@/lib/next-error";
import { normalizePhone, isValidEmail } from "@/lib/validate";
import {
  searchAvailability,
  submitBooking,
  type AvailOption,
  type RoomGuests,
  type SearchResult,
} from "../actions";

/* Booking wizard สไตล์ Agoda (เจ้าของขอ 2026-07-22):
 * ① แถบค้นหา: วันที่ + ช่อง "ผู้เข้าพัก" กดแล้วเปิด panel ระบุผู้ใหญ่/เด็ก "รายห้อง"
 *   (ละเอียดกว่า Agoda — รองรับ ห้อง1 A2K1 · ห้อง2 A1K1 · ห้อง3 A3)
 * ② การ์ดห้องแบบหน้าเลือกห้อง: ชื่อ+ไอคอนคน+เกณฑ์เด็ก ซ้าย · ราคา/คืน+ปุ่มจอง ขวา
 *   ไม่ว่าง/ติดเงื่อนไขก็โชว์ (จาง + เหตุผล) = เห็นตัวเลือกอื่นเสมอ
 * ③ ฟอร์มแขก + สรุปราคาข้างกัน → ยืนยัน → เข้าหน้ารายละเอียดการจอง */

const STEPS = ["ค้นหาห้องว่าง", "เลือกห้อง", "ข้อมูลผู้เข้าพัก"] as const;

function baht(satang: number): string {
  return (satang / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 });
}
function thShort(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/* กระจายผู้เข้าพักใหม่ให้พอดีเพดาน cap คน/ห้อง (ทุกห้องมีผู้ใหญ่ ≥1)
 * คืน null ถ้าจัดไม่ได้ (เช่น เด็กเยอะแต่ผู้ใหญ่ไม่พอประจำห้อง) */
function autoFitRooms(rooms: RoomGuests[], cap: number): RoomGuests[] | null {
  const adults = rooms.reduce((s, r) => s + r.adults, 0);
  const children = rooms.reduce((s, r) => s + r.children, 0);
  const need = Math.ceil((adults + children) / cap);
  if (cap < 1 || need > adults) return null;

  const out: RoomGuests[] = Array.from({ length: need }, () => ({ adults: 1, children: 0 }));
  let a = adults - need;
  let k = children;
  // เติมที่ว่างวนทีละห้อง — ผู้ใหญ่ก่อน แล้วค่อยเด็ก (ความจุรวมพอแน่จาก need)
  for (let i = 0; a > 0 && i < 1000; i++) {
    const r = out[i % need];
    if (r.adults + r.children < cap) {
      r.adults++;
      a--;
    }
  }
  for (let i = 0; k > 0 && i < 1000; i++) {
    const r = out[i % need];
    if (r.adults + r.children < cap) {
      r.children++;
      k--;
    }
  }
  return a === 0 && k === 0 ? out : null;
}

export function BookingWizard({
  hotelSlug,
  properties,
}: {
  hotelSlug: string;
  properties: { id: string; name: string }[];
}) {
  const router = useRouter();
  const toast = useToast();

  const [step, setStep] = useState(1);
  const [propertyId, setPropertyId] = useState(properties[0]?.id ?? "");
  const [range, setRange] = useState<DateRange | null>(null);
  const [rooms, setRooms] = useState<RoomGuests[]>([{ adults: 2, children: 0 }]);
  // โหมดกลุ่ม (หลายห้อง) — default ห้องเดียวเรียบๆ ไม่มีคำว่า "ห้อง 1" ให้งง
  const [groupMode, setGroupMode] = useState(false);

  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [selected, setSelected] = useState<AvailOption | null>(null);

  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // validate ติดต่อแบบสด — โชว์ใต้ช่องเมื่อกรอกแล้ว format ผิด (ค่าว่าง = ไม่บังคับ)
  const phoneError =
    guestPhone.trim() && !normalizePhone(guestPhone)
      ? "เบอร์ไม่ถูกต้อง — ตัวเลข 7–15 หลัก ขึ้นต้น + ได้ เช่น +66812345678"
      : null;
  const emailError =
    guestEmail.trim() && !isValidEmail(guestEmail.trim()) ? "อีเมลไม่ถูกต้อง" : null;

  const totalAdults = rooms.reduce((s, r) => s + r.adults, 0);
  const totalChildren = rooms.reduce((s, r) => s + r.children, 0);
  const nights = result?.ok ? result.nights : 0;
  const planCount = result?.ok ? new Set(result.options.map((o) => o.ratePlanId)).size : 1;

  function patchRoom(i: number, patch: Partial<RoomGuests>) {
    setRooms((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  async function onSearch(roomsArg?: RoomGuests[]) {
    if (!range) {
      toast.err("เลือกวันเข้า–ออกก่อน");
      return;
    }
    setSearching(true);
    try {
      const res = await searchAvailability({
        hotelSlug,
        propertyId,
        checkIn: range.from,
        checkOut: range.to,
        rooms: roomsArg ?? rooms,
      });
      if (!res.ok) {
        toast.err(res.reason);
        return;
      }
      setResult(res);
      setSelected(null);
      setStep(2);
    } catch (e) {
      if (isNextControlFlowError(e)) throw e;
      toast.err(e instanceof Error ? e.message : "ค้นหาไม่สำเร็จ");
    } finally {
      setSearching(false);
    }
  }

  async function onSubmit() {
    if (!range || !selected) return;
    if (!guestName.trim()) {
      toast.err("กรอกชื่อแขกก่อน");
      return;
    }
    if (phoneError || emailError) {
      toast.err(phoneError ?? emailError ?? "");
      return;
    }
    setSubmitting(true);
    try {
      const { bookingId, code } = await submitBooking({
        hotelSlug,
        propertyId,
        roomTypeId: selected.roomTypeId,
        ratePlanId: selected.ratePlanId,
        checkIn: range.from,
        checkOut: range.to,
        rooms,
        guestName: guestName.trim(),
        // เบอร์ส่งแบบ normalize แล้ว (ตัด space/ขีด) — server เช็คซ้ำอีกชั้น
        guestPhone: guestPhone.trim() ? (normalizePhone(guestPhone) ?? undefined) : undefined,
        guestEmail: guestEmail.trim() || undefined,
      });
      toast.ok(`จองสำเร็จ — ${code}`);
      router.push(hotelHref(`/bookings/${bookingId}`, hotelSlug));
    } catch (e) {
      if (isNextControlFlowError(e)) throw e;
      toast.err(e instanceof Error ? e.message : "จองไม่สำเร็จ");
      setSubmitting(false);
    }
  }

  const guestsSummary = `ผู้ใหญ่ ${totalAdults}${
    totalChildren > 0 ? ` · เด็ก ${totalChildren}` : ""
  } · ${rooms.length} ห้อง`;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      {/* ── step indicator ── */}
      <ol className="flex items-center gap-2">
        {STEPS.map((label, i) => {
          const n = i + 1;
          const state = n < step ? "done" : n === step ? "current" : "todo";
          const clickable = n < step; // กดย้อนกลับ step ที่ผ่านแล้วได้
          return (
            <li key={label} className="flex min-w-0 flex-1 items-center gap-2">
              <button
                type="button"
                disabled={!clickable}
                onClick={() => setStep(n)}
                className={`flex min-w-0 items-center gap-2 ${
                  clickable ? "cursor-pointer" : "cursor-default"
                }`}
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                    state === "done"
                      ? "bg-success text-bg"
                      : state === "current"
                        ? "bg-brand text-brand-fg"
                        : "bg-bg-subtle text-fg-subtle"
                  }`}
                >
                  {state === "done" ? <Check size={14} /> : n}
                </span>
                <span
                  className={`hidden truncate text-base sm:block ${
                    state === "current"
                      ? "font-medium text-fg"
                      : clickable
                        ? "text-fg-muted underline-offset-2 hover:text-fg hover:underline"
                        : "text-fg-muted"
                  }`}
                >
                  {label}
                </span>
              </button>
              {n < STEPS.length && <span className="h-px flex-1 bg-border" />}
            </li>
          );
        })}
      </ol>

      {/* ── ① แถบค้นหาสไตล์ Agoda ── */}
      {step === 1 && (
        <div className="card card-pad space-y-3">
          {properties.length > 1 && (
            <Field label="สาขา">
              <Select
                value={propertyId}
                onChange={setPropertyId}
                options={properties.map((p) => ({ value: p.id, label: p.name }))}
                className="w-full"
              />
            </Field>
          )}
          {/* ปฏิทินเต็มความกว้างการ์ด (เจ้าของขอ) */}
          <Field label="เช็คอิน – เช็คเอาท์">
            <DateRangePicker
              mode="range"
              value={range}
              onChange={setRange}
              placeholder="เลือกวันเข้า – วันออก"
              className="w-full"
            />
          </Field>

          {/* ผู้เข้าพัก — บรรทัดของตัวเอง · default ห้องเดียวเรียบๆ */}
          {!groupMode ? (
            <Field label="ผู้เข้าพัก">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <GuestStepper
                  card
                  icon={<Users size={18} />}
                  label="ผู้ใหญ่"
                  value={rooms[0].adults}
                  min={1}
                  onChange={(v) => patchRoom(0, { adults: v })}
                />
                <GuestStepper
                  card
                  icon={<Baby size={18} />}
                  label="เด็ก"
                  value={rooms[0].children}
                  min={0}
                  onChange={(v) => patchRoom(0, { children: v })}
                />
              </div>
            </Field>
          ) : (
            /* โหมดกลุ่ม: บรรทัดละห้อง — ครอบครัวใหญ่ 10 ห้องก็ไล่อ่านง่าย */
            <Field
              label="จองแบบกลุ่ม (หลายห้อง)"
              hint="ตัวเลขคือลำดับห้องที่จองในบิลนี้ — เบอร์ห้องจริงเลือกตอนเช็คอิน"
            >
              <div className="space-y-2">
                {rooms.map((r, i) => (
                  /* การ์ดต่อห้อง — ทั้งห้องอยู่บรรทัดเดียว: [ห้องที่ N] [ผู้ใหญ่] [เด็ก] × */
                  <div
                    key={i}
                    className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-border bg-bg-elevated px-3 py-2.5"
                  >
                    <span className="flex w-28 shrink-0 items-center gap-2 text-base font-medium text-fg">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
                        <BedDouble size={16} />
                      </span>
                      ห้องที่ {i + 1}
                    </span>
                    <GuestStepper
                      icon={<Users size={16} />}
                      label="ผู้ใหญ่"
                      value={r.adults}
                      min={1}
                      onChange={(v) => patchRoom(i, { adults: v })}
                    />
                    <GuestStepper
                      icon={<Baby size={16} />}
                      label="เด็ก"
                      value={r.children}
                      min={0}
                      onChange={(v) => patchRoom(i, { children: v })}
                    />
                    <button
                      type="button"
                      aria-label={`ลบห้องที่ ${i + 1}`}
                      disabled={rooms.length <= 1}
                      onClick={() => setRooms((rs) => rs.filter((_, idx) => idx !== i))}
                      className="ml-auto rounded-sm p-1 text-fg-subtle hover:bg-danger-soft hover:text-danger-strong disabled:opacity-30"
                    >
                      <X size={15} />
                    </button>
                  </div>
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setRooms((rs) => [...rs, { adults: 2, children: 0 }])}
                >
                  <Plus size={14} className="mr-1" />
                  เพิ่มห้อง
                </Button>
              </div>
            </Field>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* สลับโหมดห้องเดียว ↔ จองแบบกลุ่ม */}
            {!groupMode ? (
              <Button variant="ghost" size="sm" onClick={() => setGroupMode(true)}>
                <Plus size={14} className="mr-1" />
                จองหลายห้อง (แบบกลุ่ม)
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setGroupMode(false);
                  setRooms((rs) => [rs[0]]);
                }}
              >
                กลับไปจองห้องเดียว
              </Button>
            )}
            <span className="text-sm text-fg-subtle">
              เกณฑ์อายุ "เด็ก" ของแต่ละประเภทห้อง แสดงในขั้นเลือกห้อง
            </span>
          </div>

          <Button className="w-full" disabled={searching} onClick={() => onSearch()}>
            <Search size={16} className="mr-2" />
            {searching ? "กำลังค้นหา…" : "ค้นหาห้องว่าง"}
          </Button>
        </div>
      )}

      {/* ── ② การ์ดห้องแบบ Agoda ── */}
      {step === 2 && result?.ok && range && (
        <>
          {/* สรุปการค้นหา + ปุ่มแก้ไข */}
          <div className="card flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-base text-fg">
              <span className="font-medium">
                {thShort(range.from)} – {thShort(range.to)}
              </span>
              <span className="text-fg-muted">{nights} คืน</span>
              <span className="flex items-center gap-1 text-fg-muted">
                <Users size={14} />
                {guestsSummary}
              </span>
            </span>
            <Button variant="ghost" size="sm" onClick={() => setStep(1)}>
              <ChevronLeft size={15} className="mr-1" />
              เปลี่ยนการค้นหา
            </Button>
          </div>

          {result.options.every((o) => !o.ok) && (
            <p className="rounded-md bg-warning-soft p-3 text-base text-warning-strong">
              ช่วงวันนี้จองไม่ได้ทุกประเภทห้อง — ลองเปลี่ยนวันเข้าพัก หรือปรับจำนวนห้อง/ผู้เข้าพัก
            </p>
          )}

          <div className="space-y-3">
            {result.options.map((o) => {
              const perNight = o.totalSatang != null ? Math.round(o.totalSatang / nights) : null;
              return (
                <div
                  key={`${o.roomTypeId}|${o.ratePlanId}`}
                  className={`card flex flex-col gap-3 p-4 sm:flex-row sm:items-stretch ${
                    o.ok ? "" : "opacity-70"
                  }`}
                >
                  {/* ซ้าย: ข้อมูลห้อง */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-lg font-semibold text-fg">
                      <BedDouble size={20} className={o.ok ? "text-brand" : "text-fg-subtle"} />
                      {o.roomTypeName}
                      {planCount > 1 && (
                        <span className="text-base font-normal text-fg-muted">
                          · {o.ratePlanName}
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 space-y-1 text-sm text-fg-muted">
                      <div className="flex items-center gap-1.5">
                        <Users size={14} />
                        {/* base=max → ไม่รับคนเกิน · base<max → บอกค่าเสริมชัดๆ ว่าคนเกินคิดเท่าไหร่ */}
                        {o.maxOccupancy > o.baseOccupancy ? (
                          <>
                            ราคารวม {o.baseOccupancy} คน · เพิ่มได้ถึง {o.maxOccupancy} คน/ห้อง
                            (ค่าเสริม ผู้ใหญ่ +{baht(o.extraAdultSatang)}฿
                            {" · "}เด็ก +{baht(o.extraChildSatang)}฿ /คน/คืน)
                          </>
                        ) : (
                          <>พักได้สูงสุด {o.maxOccupancy} คน/ห้อง — ไม่รับคนเกิน</>
                        )}
                      </div>
                      {o.childAgeLimit != null && (
                        <div className="flex items-center gap-1.5">
                          <Baby size={14} />
                          เด็ก = อายุไม่เกิน {o.childAgeLimit} ปี
                        </div>
                      )}
                    </div>
                    {/* scarcity แบบ Agoda: เหลือน้อยตัวแดง */}
                    {o.ok &&
                      (o.availableRooms <= 3 ? (
                        <div className="mt-2 text-sm font-medium text-danger-strong">
                          เหลือ {o.availableRooms} ห้องสุดท้าย!
                        </div>
                      ) : (
                        <div className="mt-2">
                          <Badge tone="success">ว่าง {o.availableRooms} ห้อง</Badge>
                        </div>
                      ))}
                  </div>

                  {/* ขวา: ราคา + ปุ่มจอง (แบบ Agoda) */}
                  <div className="flex shrink-0 flex-row items-center justify-between gap-2 border-t border-border pt-3 sm:w-52 sm:flex-col sm:items-end sm:justify-center sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
                    {o.ok && o.totalSatang != null && perNight != null ? (
                      <>
                        <div className="text-right">
                          <div className="text-xl font-bold tabular-nums text-fg">
                            {baht(perNight)}฿
                            <span className="text-sm font-normal text-fg-muted"> /คืน</span>
                          </div>
                          <div className="text-sm text-fg-muted">
                            รวม {baht(o.totalSatang)}฿ ({nights} คืน
                            {rooms.length > 1 ? ` × ${rooms.length} ห้อง` : ""})
                          </div>
                        </div>
                        <Button
                          onClick={() => {
                            setSelected(o);
                            setStep(3);
                          }}
                        >
                          จองห้องนี้
                        </Button>
                      </>
                    ) : (
                      <div className="flex flex-col items-end gap-2 text-right">
                        <span className="text-sm font-medium text-danger-strong">{o.reason}</span>
                        {/* ติดแค่เรื่องคนเกินเพดาน → เสนอจัดห้องใหม่ให้อัตโนมัติแล้วค้นหาซ้ำ */}
                        {(() => {
                          const overMax = rooms.some(
                            (r) => r.adults + r.children > o.maxOccupancy,
                          );
                          if (!overMax) return null;
                          const fit = autoFitRooms(rooms, o.maxOccupancy);
                          if (!fit) return null;
                          return (
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={searching}
                              onClick={() => {
                                setRooms(fit);
                                setGroupMode(fit.length > 1);
                                toast.ok(
                                  `จัดใหม่เป็น ${fit.length} ห้อง (${fit
                                    .map((r) => `${r.adults + r.children} คน`)
                                    .join(" · ")}) — กำลังค้นหาซ้ำ`,
                                );
                                onSearch(fit);
                              }}
                            >
                              จัดเป็น {fit.length} ห้องให้พอดี
                            </Button>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── ③ ฟอร์มแขก + สรุปราคาข้างกัน (แบบหน้าจองของ Agoda) ── */}
      {step === 3 && selected && range && (
        <div className="grid items-start gap-4 lg:grid-cols-[1fr_20rem]">
          <div className="card card-pad space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-fg">
              <User size={19} className="text-brand" />
              ข้อมูลผู้เข้าพัก
            </h2>
            <Field label="ชื่อ-นามสกุล *">
              <Input
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="เช่น สมชาย ใจดี"
                className="w-full"
              />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="โทรศัพท์">
                <Input
                  value={guestPhone}
                  onChange={(e) => setGuestPhone(e.target.value)}
                  inputMode="tel"
                  placeholder="เช่น 0812345678 หรือ +66812345678"
                  aria-invalid={!!phoneError}
                  className="w-full"
                />
                {phoneError && (
                  <p className="mt-1 text-sm text-danger-strong">{phoneError}</p>
                )}
              </Field>
              <Field label="อีเมล">
                <Input
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                  inputMode="email"
                  placeholder="เช่น guest@email.com"
                  aria-invalid={!!emailError}
                  className="w-full"
                />
                {emailError && (
                  <p className="mt-1 text-sm text-danger-strong">{emailError}</p>
                )}
              </Field>
            </div>
            <div className="flex justify-between gap-2 pt-1">
              <Button variant="ghost" onClick={() => setStep(2)}>
                <ChevronLeft size={15} className="mr-1" />
                ย้อนกลับ
              </Button>
              <Button disabled={submitting} onClick={onSubmit}>
                {submitting ? "กำลังจอง…" : "ยืนยันการจอง"}
              </Button>
            </div>
          </div>

          {/* สรุปราคา — sticky ข้างฟอร์มบนจอใหญ่ */}
          <div className="card card-pad space-y-2 lg:sticky lg:top-4">
            <h2 className="text-lg font-semibold text-fg">สรุปการจอง</h2>
            <div className="flex items-center gap-2 text-base text-fg">
              <BedDouble size={17} className="text-brand" />
              <span className="font-medium">{selected.roomTypeName}</span>
              {planCount > 1 && <span className="text-fg-muted">· {selected.ratePlanName}</span>}
            </div>
            <div className="text-base text-fg-muted">
              {thShort(range.from)} – {thShort(range.to)} · {nights} คืน
            </div>
            <ul className="space-y-0.5 text-base text-fg-muted">
              {rooms.map((r, i) => (
                <li key={i} className="flex items-center gap-1.5">
                  <Users size={14} />
                  {rooms.length > 1 && `ห้องที่ ${i + 1}: `}ผู้ใหญ่ {r.adults}
                  {r.children > 0 && ` · เด็ก ${r.children}`}
                </li>
              ))}
            </ul>
            {selected.childAgeLimit != null && totalChildren > 0 && (
              <p className="text-sm text-fg-subtle">
                เด็ก = อายุไม่เกิน {selected.childAgeLimit} ปี (เกินคิดเป็นผู้ใหญ่)
              </p>
            )}
            {selected.totalSatang != null && (
              <div className="flex items-center justify-between border-t border-border pt-2">
                <span className="text-base text-fg-muted">ยอดรวม</span>
                <span className="text-xl font-bold tabular-nums text-fg">
                  {baht(selected.totalSatang)}฿
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* stepper ตัวเลข [- n +] แบบการ์ด+ไอคอนวงกลม (เจ้าของขอ 2026-07-22)
 * card=true → มีกรอบของตัวเอง (ตอนอยู่โดดๆ) · false → ใช้ในการ์ดห้อง (ไม่ซ้อนกรอบ) */
function GuestStepper({
  icon,
  label,
  value,
  min,
  onChange,
  card = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  min: number;
  onChange: (v: number) => void;
  card?: boolean;
}) {
  return (
    // card = กรอบของตัวเอง (label ซ้าย ปุ่มขวา) · inline = ติดกันเป็นก้อนในแถวห้อง
    <div
      className={`flex items-center gap-3 ${
        card ? "justify-between rounded-lg border border-border bg-bg-elevated p-3" : ""
      }`}
    >
      <span className="flex items-center gap-2.5 text-base font-medium text-fg">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
          {icon}
        </span>
        {label}
      </span>
      <span className="flex items-center gap-1">
        <button
          type="button"
          aria-label={`ลด${label}`}
          disabled={value <= min}
          onClick={() => onChange(Math.max(value - 1, min))}
          className="flex h-7 w-7 items-center justify-center rounded-sm border border-border text-fg transition-colors hover:border-brand disabled:opacity-40"
        >
          <Minus size={14} />
        </button>
        <span className="w-7 text-center text-base font-medium tabular-nums text-fg">{value}</span>
        <button
          type="button"
          aria-label={`เพิ่ม${label}`}
          onClick={() => onChange(value + 1)}
          className="flex h-7 w-7 items-center justify-center rounded-sm border border-border text-fg transition-colors hover:border-brand"
        >
          <Plus size={14} />
        </button>
      </span>
    </div>
  );
}
