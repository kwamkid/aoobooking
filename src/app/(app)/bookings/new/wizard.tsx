"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { hotelHref } from "@/lib/hotel/href";
import {
  checkAvailability,
  submitBooking,
  type AvailabilityResult,
} from "../actions";

type Item = { id: string; name: string; property_id: string };

const field =
  "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900";
const label = "mb-1 block text-xs font-medium text-neutral-500";

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
  const [error, setError] = useState<string | null>(null);

  const propRoomTypes = useMemo(
    () => roomTypes.filter((r) => r.property_id === propertyId),
    [roomTypes, propertyId],
  );
  const propRatePlans = useMemo(
    () => ratePlans.filter((r) => r.property_id === propertyId),
    [ratePlans, propertyId],
  );

  const canCheck =
    propertyId && roomTypeId && ratePlanId && checkIn && checkOut && rooms >= 1;

  async function onCheck() {
    setError(null);
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
      setError(e instanceof Error ? e.message : "ตรวจสอบไม่สำเร็จ");
    } finally {
      setChecking(false);
    }
  }

  async function onSubmit() {
    if (!guestName.trim()) {
      setError("กรุณาใส่ชื่อแขก");
      return;
    }
    setError(null);
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
      router.push(hotelHref(`/bookings?created=${bookingId}`, hotelSlug));
    } catch (e) {
      setError(e instanceof Error ? e.message : "จองไม่สำเร็จ");
      setSubmitting(false);
    }
  }

  // เปลี่ยน input ใดๆ ที่กระทบราคา → ล้างผลตรวจเดิม (กันจองจากราคาเก่า)
  function resetAvail() {
    setAvail(null);
  }

  return (
    <div className="space-y-6">
      {/* ① เลือกห้อง + วัน */}
      <section className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="mb-3 font-semibold">① ห้องพัก &amp; วันที่</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={label}>สาขา</label>
            <select
              className={field}
              value={propertyId}
              onChange={(e) => {
                setPropertyId(e.target.value);
                setRoomTypeId("");
                setRatePlanId("");
                resetAvail();
              }}
            >
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={label}>ประเภทห้อง</label>
            <select
              className={field}
              value={roomTypeId}
              onChange={(e) => {
                setRoomTypeId(e.target.value);
                resetAvail();
              }}
            >
              <option value="">— เลือก —</option>
              {propRoomTypes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={label}>Rate plan</label>
            <select
              className={field}
              value={ratePlanId}
              onChange={(e) => {
                setRatePlanId(e.target.value);
                resetAvail();
              }}
            >
              <option value="">— เลือก —</option>
              {propRatePlans.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={label}>เช็คอิน</label>
            <input
              type="date"
              className={field}
              value={checkIn}
              onChange={(e) => {
                setCheckIn(e.target.value);
                resetAvail();
              }}
            />
          </div>
          <div>
            <label className={label}>เช็คเอาท์</label>
            <input
              type="date"
              className={field}
              value={checkOut}
              onChange={(e) => {
                setCheckOut(e.target.value);
                resetAvail();
              }}
            />
          </div>

          <div>
            <label className={label}>จำนวนห้อง</label>
            <input
              type="number"
              min={1}
              className={field}
              value={rooms}
              onChange={(e) => {
                setRooms(Number(e.target.value));
                resetAvail();
              }}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={label}>ผู้ใหญ่</label>
              <input
                type="number"
                min={1}
                className={field}
                value={adults}
                onChange={(e) => {
                  setAdults(Number(e.target.value));
                  resetAvail();
                }}
              />
            </div>
            <div>
              <label className={label}>เด็ก</label>
              <input
                type="number"
                min={0}
                className={field}
                value={children}
                onChange={(e) => {
                  setChildren(Number(e.target.value));
                  resetAvail();
                }}
              />
            </div>
          </div>
        </div>

        <button
          onClick={onCheck}
          disabled={!canCheck || checking}
          className="mt-4 rounded-md border border-neutral-300 px-4 py-2 text-sm disabled:opacity-40 dark:border-neutral-700"
        >
          {checking ? "กำลังตรวจ…" : "ตรวจห้องว่าง & ราคา"}
        </button>
      </section>

      {/* ผลตรวจ */}
      {avail && !avail.ok && (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30">
          {avail.reason}
        </p>
      )}

      {avail?.ok && (
        <>
          <section className="rounded-lg border border-green-300 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950/20">
            <div className="flex items-baseline justify-between">
              <span className="font-semibold text-green-800 dark:text-green-300">
                ว่าง — {avail.nights} คืน
              </span>
              <span className="text-lg font-bold">
                {avail.totalBaht.toLocaleString()}฿
              </span>
            </div>
            <ul className="mt-2 text-xs text-neutral-500">
              {avail.perNight.map((n) => (
                <li key={n.date}>
                  {n.date} · {n.priceBaht.toLocaleString()}฿
                </li>
              ))}
            </ul>
          </section>

          {/* ② ข้อมูลแขก */}
          <section className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
            <h2 className="mb-3 font-semibold">② ข้อมูลแขก</h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className={label}>ชื่อ-นามสกุล *</label>
                <input
                  className={field}
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                />
              </div>
              <div>
                <label className={label}>โทรศัพท์</label>
                <input
                  className={field}
                  value={guestPhone}
                  onChange={(e) => setGuestPhone(e.target.value)}
                />
              </div>
              <div>
                <label className={label}>อีเมล</label>
                <input
                  className={field}
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                />
              </div>
            </div>
          </section>

          {/* ③ ยืนยัน */}
          <button
            onClick={onSubmit}
            disabled={submitting}
            className="w-full rounded-md bg-neutral-900 px-4 py-3 font-medium text-white disabled:opacity-40 dark:bg-white dark:text-neutral-900"
          >
            {submitting
              ? "กำลังจอง…"
              : `ยืนยันการจอง (${avail.totalBaht.toLocaleString()}฿)`}
          </button>
        </>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
