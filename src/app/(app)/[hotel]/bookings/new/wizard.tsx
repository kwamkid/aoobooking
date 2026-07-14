"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { hotelHref } from "@/lib/hotel/href";
import { Card, Field, Input, Select, Button, useToast } from "@/components/ui";
import {
  checkAvailability,
  submitBooking,
  type AvailabilityResult,
} from "../actions";

type Item = { id: string; name: string; property_id: string };

export function BookingWizard({
  hotelSlug,
  properties,
  roomTypes,
  ratePlans,
}: {
  hotelSlug: string;
  properties: { id: string; name: string }[];
  roomTypes: Item[];
  ratePlans: Item[];
}) {
  const router = useRouter();
  const [propertyId, setPropertyId] = useState(properties[0]?.id ?? "");
  const [roomTypeId, setRoomTypeId] = useState("");
  const [ratePlanId, setRatePlanId] = useState("");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [rooms, setRooms] = useState(1);
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);

  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestEmail, setGuestEmail] = useState("");

  const [avail, setAvail] = useState<AvailabilityResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  const propRoomTypes = useMemo(
    () => roomTypes.filter((r) => r.property_id === propertyId),
    [roomTypes, propertyId],
  );
  const propRatePlans = useMemo(
    () => ratePlans.filter((r) => r.property_id === propertyId),
    [ratePlans, propertyId],
  );

  const canCheck =
    !!(propertyId && roomTypeId && ratePlanId && checkIn && checkOut) && rooms >= 1;

  async function onCheck() {
    setAvail(null);
    setChecking(true);
    try {
      const res = await checkAvailability({
        hotelSlug,
        roomTypeId,
        ratePlanId,
        checkIn,
        checkOut,
        rooms,
        adults,
        children,
      });
      setAvail(res);
    } catch (e) {
      toast.err(e instanceof Error ? e.message : "ตรวจสอบไม่สำเร็จ");
    } finally {
      setChecking(false);
    }
  }

  async function onSubmit() {
    if (!guestName.trim()) {
      toast.err("กรุณาใส่ชื่อแขก");
      return;
    }
    setSubmitting(true);
    try {
      const { bookingId } = await submitBooking({
        hotelSlug,
        propertyId,
        roomTypeId,
        ratePlanId,
        checkIn,
        checkOut,
        rooms,
        adults,
        children,
        guestName: guestName.trim(),
        guestPhone: guestPhone.trim() || undefined,
        guestEmail: guestEmail.trim() || undefined,
      });
      toast.ok("จองสำเร็จ");
      router.push(hotelHref(`/bookings?created=${bookingId}`, hotelSlug));
    } catch (e) {
      toast.err(e instanceof Error ? e.message : "จองไม่สำเร็จ");
      setSubmitting(false);
    }
  }

  // เปลี่ยน input ใดๆ ที่กระทบราคา → ล้างผลตรวจเดิม (กันจองจากราคาเก่า)
  const resetAvail = () => setAvail(null);

  return (
    <div className="space-y-6">
      {/* ① เลือกห้อง + วัน */}
      <Card>
        <h2 className="mb-3 font-semibold text-fg">① ห้องพัก &amp; วันที่</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="สาขา" className="sm:col-span-2">
            <Select
              value={propertyId}
              onChange={(v) => {
                setPropertyId(v);
                setRoomTypeId("");
                setRatePlanId("");
                resetAvail();
              }}
              options={properties.map((p) => ({ value: p.id, label: p.name }))}
            />
          </Field>

          <Field label="ประเภทห้อง">
            <Select
              value={roomTypeId}
              onChange={(v) => {
                setRoomTypeId(v);
                resetAvail();
              }}
              placeholder="— เลือก —"
              options={propRoomTypes.map((r) => ({ value: r.id, label: r.name }))}
            />
          </Field>
          <Field label="Rate plan">
            <Select
              value={ratePlanId}
              onChange={(v) => {
                setRatePlanId(v);
                resetAvail();
              }}
              placeholder="— เลือก —"
              options={propRatePlans.map((r) => ({ value: r.id, label: r.name }))}
            />
          </Field>

          <Field label="เช็คอิน">
            <Input
              type="date"
              value={checkIn}
              onChange={(e) => {
                setCheckIn(e.target.value);
                resetAvail();
              }}
            />
          </Field>
          <Field label="เช็คเอาท์">
            <Input
              type="date"
              value={checkOut}
              onChange={(e) => {
                setCheckOut(e.target.value);
                resetAvail();
              }}
            />
          </Field>

          <Field label="จำนวนห้อง">
            <Input
              type="number"
              min={1}
              value={rooms}
              onChange={(e) => {
                setRooms(Number(e.target.value));
                resetAvail();
              }}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="ผู้ใหญ่">
              <Input
                type="number"
                min={1}
                value={adults}
                onChange={(e) => {
                  setAdults(Number(e.target.value));
                  resetAvail();
                }}
              />
            </Field>
            <Field label="เด็ก">
              <Input
                type="number"
                min={0}
                value={children}
                onChange={(e) => {
                  setChildren(Number(e.target.value));
                  resetAvail();
                }}
              />
            </Field>
          </div>
        </div>

        <Button
          variant="secondary"
          onClick={onCheck}
          disabled={!canCheck || checking}
          className="mt-4"
        >
          {checking ? "กำลังตรวจ…" : "ตรวจห้องว่าง & ราคา"}
        </Button>
      </Card>

      {/* ผลตรวจ */}
      {avail && !avail.ok && (
        <p className="rounded-(--radius) bg-danger-soft p-3 text-sm text-danger">
          {avail.reason}
        </p>
      )}

      {avail?.ok && (
        <>
          <div className="rounded-lg border border-success bg-success-soft p-4">
            <div className="flex items-baseline justify-between">
              <span className="font-semibold text-success">ว่าง — {avail.nights} คืน</span>
              <span className="text-lg font-bold text-fg">
                {avail.totalBaht.toLocaleString()}฿
              </span>
            </div>
            <ul className="mt-2 text-xs text-fg-muted">
              {avail.perNight.map((n) => (
                <li key={n.date}>
                  {n.date} · {n.priceBaht.toLocaleString()}฿
                </li>
              ))}
            </ul>
          </div>

          {/* ② ข้อมูลแขก */}
          <Card>
            <h2 className="mb-3 font-semibold text-fg">② ข้อมูลแขก</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="ชื่อ-นามสกุล *" className="sm:col-span-2">
                <Input value={guestName} onChange={(e) => setGuestName(e.target.value)} />
              </Field>
              <Field label="โทรศัพท์">
                <Input value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} />
              </Field>
              <Field label="อีเมล">
                <Input value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} />
              </Field>
            </div>
          </Card>

          {/* ③ ยืนยัน */}
          <Button
            size="lg"
            onClick={onSubmit}
            disabled={submitting}
            className="w-full"
          >
            {submitting
              ? "กำลังจอง…"
              : `ยืนยันการจอง (${avail.totalBaht.toLocaleString()}฿)`}
          </Button>
        </>
      )}
    </div>
  );
}
