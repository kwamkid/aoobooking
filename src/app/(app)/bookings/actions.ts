"use server";

import { requireHotelMember } from "@/lib/auth";
import { requirePermission } from "@/lib/permission";
import { createClient } from "@/lib/supabase/server";

// ── ตรวจห้องว่าง + ราคา ก่อนยืนยัน (query สด จาก inventory + rate_prices) ────
export type AvailabilityResult =
  | { ok: true; nights: number; totalBaht: number; perNight: { date: string; priceBaht: number }[] }
  | { ok: false; reason: string };

export async function checkAvailability(input: {
  hotelSlug: string;
  roomTypeId: string;
  ratePlanId: string;
  checkIn: string;
  checkOut: string;
  rooms: number;
  adults: number;
  children: number;
}): Promise<AvailabilityResult> {
  const { hotel } = await requireHotelMember(input.hotelSlug);
  await requirePermission(hotel.id, "bookings.create");

  const start = new Date(input.checkIn + "T00:00:00Z");
  const end = new Date(input.checkOut + "T00:00:00Z");
  if (end <= start) return { ok: false, reason: "วันออกต้องหลังวันเข้า" };

  const supabase = await createClient();

  // ประเภทห้อง (occupancy pricing)
  const { data: rt } = await supabase
    .from("room_types")
    .select("base_occupancy, extra_adult_satang, extra_child_satang")
    .eq("id", input.roomTypeId)
    .single();
  const rtRow = rt as {
    base_occupancy: number;
    extra_adult_satang: number;
    extra_child_satang: number;
  } | null;
  if (!rtRow) return { ok: false, reason: "ไม่พบประเภทห้อง" };
  const extraAdults = Math.max(input.adults - rtRow.base_occupancy, 0);

  // loop วัน [checkIn, checkOut) — off-by-one guard (ไม่รวมวันออก)
  const dates: string[] = [];
  for (let d = new Date(start); d < end; d.setUTCDate(d.getUTCDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10));
  }

  const [{ data: invData }, { data: priceData }] = await Promise.all([
    supabase
      .from("room_type_inventory")
      .select("date, total, booked, blocked")
      .eq("room_type_id", input.roomTypeId)
      .in("date", dates),
    supabase
      .from("rate_prices")
      .select("date, price_satang, closed")
      .eq("rate_plan_id", input.ratePlanId)
      .eq("room_type_id", input.roomTypeId)
      .in("date", dates),
  ]);

  const inv = new Map(
    (invData ?? []).map((r) => {
      const row = r as { date: string; total: number; booked: number; blocked: number };
      return [row.date, row.total - row.booked - row.blocked];
    }),
  );
  const prices = new Map(
    (priceData ?? []).map((r) => {
      const row = r as { date: string; price_satang: number; closed: boolean };
      return [row.date, row.closed ? null : row.price_satang];
    }),
  );

  const perNight: { date: string; priceBaht: number }[] = [];
  let totalSatang = 0;
  for (const date of dates) {
    const avail = inv.get(date) ?? 0;
    if (avail < input.rooms) {
      return { ok: false, reason: `ห้องไม่พอวันที่ ${date} (เหลือ ${avail})` };
    }
    const base = prices.get(date);
    if (base == null) {
      return { ok: false, reason: `ยังไม่ตั้งราคาวันที่ ${date} (หรือปิดขาย)` };
    }
    const night =
      (base +
        extraAdults * rtRow.extra_adult_satang +
        input.children * rtRow.extra_child_satang) *
      input.rooms;
    totalSatang += night;
    perNight.push({ date, priceBaht: night / 100 });
  }

  return {
    ok: true,
    nights: dates.length,
    totalBaht: totalSatang / 100,
    perNight,
  };
}

// ── ยืนยันการจอง → เรียก RPC create_booking (front desk = confirmed ทันที) ──
export async function submitBooking(input: {
  hotelSlug: string;
  propertyId: string;
  roomTypeId: string;
  ratePlanId: string;
  checkIn: string;
  checkOut: string;
  rooms: number;
  adults: number;
  children: number;
  guestName: string;
  guestPhone?: string;
  guestEmail?: string;
}): Promise<{ bookingId: string; code: string }> {
  const { hotel } = await requireHotelMember(input.hotelSlug);
  await requirePermission(hotel.id, "bookings.create");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_booking", {
    p_hotel_id: hotel.id,
    p_property_id: input.propertyId,
    p_room_type_id: input.roomTypeId,
    p_rate_plan_id: input.ratePlanId,
    p_check_in: input.checkIn,
    p_check_out: input.checkOut,
    p_rooms: input.rooms,
    p_adults: input.adults,
    p_children: input.children,
    p_guest: {
      full_name: input.guestName,
      phone: input.guestPhone ?? null,
      email: input.guestEmail ?? null,
    },
    p_channel: "front_desk",
    p_hold_minutes: null, // front desk ยืนยันทันที ไม่มี hold
  });
  if (error) throw new Error(error.message);

  const result = data as { booking_id: string; code: string };
  return { bookingId: result.booking_id, code: result.code };
}
