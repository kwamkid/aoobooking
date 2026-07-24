"use server";

import { revalidateHotel } from "@/lib/hotel/revalidate";
import { requireHotelMember } from "@/lib/auth";
import { requirePermission } from "@/lib/permission";
import { createClient } from "@/lib/supabase/server";
import { normalizePhone, isValidEmail } from "@/lib/validate";

// ── ค้นหาห้องว่างทุกประเภท (per-room guests) — ไม่ว่างก็เห็นตัวเลือกอื่น ─────
// ตรรกะราคา/โควตา ตรงกับ create_booking v3 (migration 39): เพดาน+ค่าเสริมคิดรายห้อง
// ⚠️ สูตรเงินซ้ำ 2 ที่ (RPC + preview นี้) — แก้ฝั่งหนึ่งต้องไล่แก้อีกฝั่ง (bugs.md §Booking)

export type RoomGuests = { adults: number; children: number };

export type AvailOption = {
  roomTypeId: string;
  roomTypeName: string;
  ratePlanId: string;
  ratePlanName: string;
  baseOccupancy: number;
  maxOccupancy: number;
  childAgeLimit: number | null;
  /** ค่าเสริม/คน/คืน เมื่อพักเกินจำนวนปกติ (0 = ไม่คิดเพิ่ม) */
  extraAdultSatang: number;
  extraChildSatang: number;
  /** ห้องว่างต่ำสุดตลอดช่วง */
  availableRooms: number;
  /** จองได้ตามเงื่อนไขที่กรอก */
  ok: boolean;
  /** เหตุผลที่จองไม่ได้ เช่น ไม่ว่าง / เกินเพดานคน / ยังไม่ตั้งราคา */
  reason: string | null;
  totalSatang: number | null;
};

export type SearchResult =
  | { ok: true; nights: number; options: AvailOption[] }
  | { ok: false; reason: string };

export async function searchAvailability(input: {
  hotelSlug: string;
  propertyId: string;
  checkIn: string;
  checkOut: string;
  rooms: RoomGuests[];
}): Promise<SearchResult> {
  const { hotel } = await requireHotelMember(input.hotelSlug);
  await requirePermission(hotel.id, "bookings.create");

  const start = new Date(input.checkIn + "T00:00:00Z");
  const end = new Date(input.checkOut + "T00:00:00Z");
  if (!(end > start)) return { ok: false, reason: "เลือกวันเข้า–ออกก่อน (วันออกต้องหลังวันเข้า)" };
  const nRooms = input.rooms.length;
  if (nRooms < 1) return { ok: false, reason: "ต้องมีอย่างน้อย 1 ห้อง" };
  if (input.rooms.some((r) => r.adults < 1)) {
    return { ok: false, reason: "ทุกห้องต้องมีผู้ใหญ่อย่างน้อย 1 คน" };
  }

  const dates: string[] = [];
  for (let d = new Date(start); d < end; d.setUTCDate(d.getUTCDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10));
  }
  const nights = dates.length;

  const supabase = await createClient();
  const [
    { data: rtData },
    { data: planData },
    { data: invData },
    { data: ovData },
    { data: baseData },
    { data: roomCntData },
  ] = await Promise.all([
    supabase
      .from("room_types")
      .select(
        "id, name, base_occupancy, max_occupancy, extra_adult_satang, extra_child_satang, child_age_limit",
      )
      .eq("property_id", input.propertyId)
      .is("deleted_at", null)
      .order("sort_order"),
    supabase
      .from("rate_plans")
      .select("id, name")
      .eq("property_id", input.propertyId)
      .eq("is_active", true)
      .is("deleted_at", null) // กันแพลนที่ลบแล้วโผล่ซ้ำ (บั๊ก 2026-07-22)
      .order("sort_order"),
    supabase
      .from("room_type_inventory")
      .select("room_type_id, date, total, booked, blocked")
      .eq("hotel_id", hotel.id)
      .in("date", dates),
    supabase
      .from("rate_prices")
      .select("room_type_id, rate_plan_id, date, price_satang, closed")
      .eq("hotel_id", hotel.id)
      .in("date", dates),
    supabase
      .from("rate_base_prices")
      .select("room_type_id, rate_plan_id, price_satang")
      .eq("hotel_id", hotel.id),
    // จำนวนห้องจริงต่อประเภท — fallback วันที่ inventory ยังไม่ seed (ไม่มีแถว = ว่างเต็ม)
    supabase
      .from("rooms")
      .select("room_type_id")
      .eq("hotel_id", hotel.id)
      .eq("is_active", true)
      .is("deleted_at", null),
  ]);

  type RT = {
    id: string;
    name: string;
    base_occupancy: number;
    max_occupancy: number;
    extra_adult_satang: number;
    extra_child_satang: number;
    child_age_limit: number | null;
  };
  const roomTypes = (rtData ?? []) as RT[];
  const plans = (planData ?? []) as { id: string; name: string }[];
  if (roomTypes.length === 0) return { ok: false, reason: "สาขานี้ยังไม่มีประเภทห้อง" };
  if (plans.length === 0) return { ok: false, reason: "สาขานี้ยังไม่มีแพ็กเกจราคา" };

  const roomCount = new Map<string, number>();
  for (const r of roomCntData ?? []) {
    roomCount.set(r.room_type_id, (roomCount.get(r.room_type_id) ?? 0) + 1);
  }
  const inv = new Map<string, number>(); // `${type}|${date}` → available
  for (const r of invData ?? []) {
    inv.set(`${r.room_type_id}|${r.date}`, r.total - r.booked - r.blocked);
  }
  const ov = new Map<string, number | "closed">(); // `${type}|${plan}|${date}`
  for (const r of ovData ?? []) {
    ov.set(`${r.room_type_id}|${r.rate_plan_id}|${r.date}`, r.closed ? "closed" : r.price_satang);
  }
  const base = new Map<string, number>(); // `${type}|${plan}`
  for (const r of baseData ?? []) {
    base.set(`${r.room_type_id}|${r.rate_plan_id}`, r.price_satang);
  }

  const options: AvailOption[] = [];
  for (const rt of roomTypes) {
    let minAvail = Infinity;
    for (const d of dates) {
      minAvail = Math.min(minAvail, inv.get(`${rt.id}|${d}`) ?? roomCount.get(rt.id) ?? 0);
    }
    if (!Number.isFinite(minAvail)) minAvail = 0;

    // เพดานคน + ค่าเสริม เช็ค "รายห้อง" (ตรงกับ RPC v3) — บอกชัดว่าห้องไหนเกิน
    const overRooms = input.rooms
      .map((r, i) => ({ no: i + 1, count: r.adults + r.children }))
      .filter((x) => x.count > rt.max_occupancy);
    const overMax = overRooms.length > 0;
    let extraPerNight = 0;
    for (const r of input.rooms) {
      const extraA = Math.max(r.adults - rt.base_occupancy, 0);
      const aInBase = r.adults - extraA;
      const extraK = Math.max(r.children - Math.max(rt.base_occupancy - aInBase, 0), 0);
      extraPerNight += extraA * rt.extra_adult_satang + extraK * rt.extra_child_satang;
    }

    for (const plan of plans) {
      let baseSum = 0;
      let priceReason: string | null = null;
      for (const d of dates) {
        const o = ov.get(`${rt.id}|${plan.id}|${d}`);
        if (o === "closed") {
          priceReason = `ปิดขายวันที่ ${d}`;
          break;
        }
        const p = o ?? base.get(`${rt.id}|${plan.id}`);
        if (p == null) {
          priceReason = "ยังไม่ตั้งราคา";
          break;
        }
        baseSum += p;
      }

      const reason = overMax
        ? `${overRooms.map((x) => `ห้องที่ ${x.no} มี ${x.count} คน`).join(" · ")} — เกินเพดาน ${rt.max_occupancy} คน/ห้อง (แยกคนไปอีกห้อง/เพิ่มห้อง)`
        : minAvail < nRooms
          ? minAvail === 0
            ? "ไม่ว่างในช่วงนี้"
            : `ว่างแค่ ${minAvail} ห้อง (ต้องการ ${nRooms})`
          : priceReason;

      options.push({
        roomTypeId: rt.id,
        roomTypeName: rt.name,
        ratePlanId: plan.id,
        ratePlanName: plan.name,
        baseOccupancy: rt.base_occupancy,
        maxOccupancy: rt.max_occupancy,
        childAgeLimit: rt.child_age_limit,
        extraAdultSatang: rt.extra_adult_satang,
        extraChildSatang: rt.extra_child_satang,
        availableRooms: Math.max(minAvail, 0),
        ok: reason === null,
        reason,
        totalSatang: priceReason ? null : baseSum * nRooms + extraPerNight * nights,
      });
    }
  }

  // เรียง: จองได้ก่อน (ถูก→แพง) แล้วค่อยตัวที่ติดเงื่อนไข
  options.sort((a, z) =>
    a.ok === z.ok ? (a.totalSatang ?? Infinity) - (z.totalSatang ?? Infinity) : a.ok ? -1 : 1,
  );
  return { ok: true, nights, options };
}

// ── ยืนยันการจอง → RPC create_booking v3 (front desk = confirmed ทันที) ─────
export async function submitBooking(input: {
  hotelSlug: string;
  propertyId: string;
  roomTypeId: string;
  ratePlanId: string;
  checkIn: string;
  checkOut: string;
  rooms: RoomGuests[];
  guestName: string;
  guestPhone?: string;
  guestEmail?: string;
}): Promise<{ bookingId: string; code: string }> {
  const { hotel } = await requireHotelMember(input.hotelSlug);
  await requirePermission(hotel.id, "bookings.create");

  // validate ติดต่อฝั่ง server ด้วย (client เช็คแล้วแต่อย่าเชื่อ) — กรอกมาค่อยเช็ค
  let phone: string | null = null;
  if (input.guestPhone?.trim()) {
    phone = normalizePhone(input.guestPhone);
    if (!phone) throw new Error("เบอร์โทรไม่ถูกต้อง — ใช้ตัวเลข 7–15 หลัก ขึ้นต้น + ได้");
  }
  const email = input.guestEmail?.trim() || null;
  if (email && !isValidEmail(email)) throw new Error("อีเมลไม่ถูกต้อง");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_booking", {
    p_hotel_id: hotel.id,
    p_property_id: input.propertyId,
    p_room_type_id: input.roomTypeId,
    p_rate_plan_id: input.ratePlanId,
    p_check_in: input.checkIn,
    p_check_out: input.checkOut,
    p_room_guests: input.rooms,
    p_guest: {
      full_name: input.guestName,
      phone,
      email,
    },
    p_channel: "front_desk",
    // p_hold_minutes: omit → DB default null = front desk ยืนยันทันที ไม่มี hold
  });
  if (error) throw new Error(error.message);

  const result = data as { booking_id: string; code: string };
  return { bookingId: result.booking_id, code: result.code };
}

// ── เปลี่ยนสถานะจากหน้า list (เจ้าของขอ 2026-07-17) ─────────────────────────
// ทุก action ลง audit log (log_audit เก็บ actor = auth.uid + old/new) → ดูย้อนได้ที่
// ตั้งค่า > บันทึกกิจกรรม ว่าใครทำอะไร เปลี่ยนจากค่าไหนเป็นค่าไหน

export async function confirmBooking(fd: FormData) {
  const hotelSlug = fd.get("hotelSlug") as string;
  const bookingId = fd.get("bookingId") as string;
  const { hotel } = await requireHotelMember(hotelSlug);
  await requirePermission(hotel.id, "bookings.edit");

  const supabase = await createClient();
  // ยืนยันได้เฉพาะ pending — กัน override สถานะอื่นด้วยเงื่อนไขใน update เอง (atomic)
  const { data, error } = await supabase
    .from("bookings")
    .update({ status: "confirmed", hold_expires_at: null })
    .eq("id", bookingId)
    .eq("hotel_id", hotel.id)
    .eq("status", "pending")
    .select("id, code")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("ยืนยันไม่ได้ — การจองไม่อยู่ในสถานะรอยืนยันแล้ว");

  await supabase.rpc("log_audit", {
    p_hotel_id: hotel.id,
    p_action: "booking.confirmed",
    p_entity_type: "booking",
    p_entity_id: bookingId,
    p_old: { status: "pending" },
    p_new: { status: "confirmed" },
  });
  revalidateHotel(hotelSlug, "/bookings", "/front-desk");
}

export async function cancelBooking(fd: FormData) {
  const hotelSlug = fd.get("hotelSlug") as string;
  const bookingId = fd.get("bookingId") as string;
  const { hotel } = await requireHotelMember(hotelSlug);
  await requirePermission(hotel.id, "bookings.cancel");

  const supabase = await createClient();
  // RPC จัดการครบใน transaction: คืน inventory + คำนวณ refund ตาม policy + log_audit
  const { error } = await supabase.rpc("cancel_booking", {
    p_booking_id: bookingId,
  });
  if (error) throw new Error(error.message);
  revalidateHotel(hotelSlug, "/bookings", "/front-desk", "/calendar");
}

// ── No-show — แขกไม่มาตามนัด (ทำได้ตั้งแต่วันเข้าพัก · สิทธิ์เดียวกับยกเลิก) ──
// RPC ใน transaction: คืน inventory คืนที่เหลือ + ยึด/คืนเงินตาม policy + audit
export async function markNoShow(
  fd: FormData,
): Promise<{ refundSatang: number; forfeitSatang: number }> {
  const hotelSlug = fd.get("hotelSlug") as string;
  const bookingId = fd.get("bookingId") as string;
  const { hotel } = await requireHotelMember(hotelSlug);
  await requirePermission(hotel.id, "bookings.cancel");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mark_no_show", {
    p_booking_id: bookingId,
  });
  if (error) throw new Error(error.message);
  revalidateHotel(hotelSlug, "/bookings", "/front-desk", "/calendar");

  const r = data as { refund_satang: number; forfeit_satang: number };
  return { refundSatang: r.refund_satang, forfeitSatang: r.forfeit_satang };
}
