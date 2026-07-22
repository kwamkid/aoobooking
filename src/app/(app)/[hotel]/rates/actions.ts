"use server";

import { revalidateHotel } from "@/lib/hotel/revalidate";
import { requireHotelMember } from "@/lib/auth";
import { requirePermission } from "@/lib/permission";
import { createClient } from "@/lib/supabase/server";

// ── rate plans ───────────────────────────────────────────────────────────────
export async function createRatePlan(fd: FormData) {
  const hotelSlug = fd.get("hotelSlug") as string;
  const propertyId = fd.get("propertyId") as string;
  const { hotel } = await requireHotelMember(hotelSlug);
  await requirePermission(hotel.id, "rates.edit");

  const name = (fd.get("name") as string)?.trim();
  if (!name) throw new Error("กรุณาใส่ชื่อ rate plan");

  // deposit policy จาก dropdown (§14.3)
  const depType = fd.get("deposit_type") as string;
  const depValue = Number(fd.get("deposit_value") ?? 0);
  const depositPolicy =
    depType === "percent"
      ? { type: "percent", value: depValue }
      : depType === "fixed"
        ? { type: "fixed", value: depValue }
        : { type: depType || "none" }; // none / first_night / full

  // cancellation policy (§14.4) — แบบง่าย: free_until N วัน หรือ non_refundable
  const cancelType = fd.get("cancel_type") as string;
  const cancelDays = Number(fd.get("cancel_days") ?? 1);
  const cancellationPolicy =
    cancelType === "non_refundable"
      ? { type: "non_refundable" }
      : { type: "free_until", days_before: cancelDays };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rate_plans")
    .insert({
      hotel_id: hotel.id,
      property_id: propertyId,
      name,
      deposit_policy: depositPolicy,
      cancellation_policy: cancellationPolicy,
      include_breakfast: fd.get("include_breakfast") === "on",
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505")
      throw new Error(`มีแพ็กเกจราคาชื่อ "${name}" อยู่แล้วในสาขานี้`);
    throw new Error(error.message);
  }

  await supabase.rpc("log_audit", {
    p_hotel_id: hotel.id,
    p_action: "rate_plan.created",
    p_entity_type: "rate_plan",
    p_entity_id: (data as { id: string }).id,
    p_new: { name },
  });
  revalidateHotel(hotelSlug, "/rates");
}

// ── ราคาปกติ (ไม่ผูกวัน — ยืนพื้นให้จองได้ตลอด) ─────────────────────────────
export async function setBasePrice(fd: FormData) {
  const hotelSlug = fd.get("hotelSlug") as string;
  const ratePlanId = fd.get("ratePlanId") as string;
  const roomTypeId = fd.get("roomTypeId") as string;
  const priceBaht = Number(fd.get("price") ?? -1);

  const { hotel } = await requireHotelMember(hotelSlug);
  await requirePermission(hotel.id, "rates.edit");
  if (!(priceBaht >= 0)) throw new Error("ราคาต้องไม่ติดลบ");

  const supabase = await createClient();
  const { error } = await supabase.from("rate_base_prices").upsert(
    {
      hotel_id: hotel.id,
      rate_plan_id: ratePlanId,
      room_type_id: roomTypeId,
      price_satang: Math.round(priceBaht * 100),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "rate_plan_id,room_type_id" },
  );
  if (error) throw new Error(error.message);

  await supabase.rpc("log_audit", {
    p_hotel_id: hotel.id,
    p_action: "rates.base_updated",
    p_entity_type: "rate_plan",
    p_entity_id: ratePlanId,
    p_new: { room_type_id: roomTypeId, price_satang: Math.round(priceBaht * 100) },
  });
  revalidateHotel(hotelSlug, "/rates");
}

// ── ลบช่วงราคาพิเศษ (ลบ override → วันนั้นกลับไปใช้ราคาปกติ) ─────────────────
export async function deletePriceRange(fd: FormData) {
  const hotelSlug = fd.get("hotelSlug") as string;
  const ratePlanId = fd.get("ratePlanId") as string;
  const roomTypeId = fd.get("roomTypeId") as string;
  const from = fd.get("from") as string;
  const to = fd.get("to") as string;

  const { hotel } = await requireHotelMember(hotelSlug);
  await requirePermission(hotel.id, "rates.edit");
  if (!from || !to) throw new Error("ไม่พบช่วงวันที่");

  const supabase = await createClient();
  const { error } = await supabase
    .from("rate_prices")
    .delete()
    .eq("hotel_id", hotel.id)
    .eq("rate_plan_id", ratePlanId)
    .eq("room_type_id", roomTypeId)
    .gte("date", from)
    .lte("date", to);
  if (error) throw new Error(error.message);

  await supabase.rpc("log_audit", {
    p_hotel_id: hotel.id,
    p_action: "rates.range_deleted",
    p_entity_type: "rate_plan",
    p_entity_id: ratePlanId,
    p_new: { room_type_id: roomTypeId, from, to },
  });
  revalidateHotel(hotelSlug, "/rates");
}

// ── ช่วงราคาพิเศษ (season) — ใส่ราคาหลายประเภทห้องในครั้งเดียว ────────────────
// form ส่งราคาเป็นช่อง `price__<roomTypeId>` — เว้นว่าง = ไม่แตะห้องนั้น
export async function setSeasonPrices(fd: FormData) {
  const hotelSlug = fd.get("hotelSlug") as string;
  const ratePlanId = fd.get("ratePlanId") as string;
  const from = fd.get("from") as string;
  const to = fd.get("to") as string;
  const minStay = Math.max(Number(fd.get("min_stay") ?? 1), 1);

  const { hotel } = await requireHotelMember(hotelSlug);
  await requirePermission(hotel.id, "rates.edit");

  if (!from || !to) throw new Error("เลือกช่วงวันที่");
  const start = new Date(from + "T00:00:00Z");
  const end = new Date(to + "T00:00:00Z");
  if (end < start) throw new Error("วันสิ้นสุดต้องไม่ก่อนวันเริ่ม");
  const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  if (days > 366) throw new Error("ช่วงวันยาวเกินไป (สูงสุด 1 ปี)");

  // ราคาต่อประเภทห้องจากช่อง price__<id> (เว้นว่าง = ข้าม)
  const wanted = new Map<string, number>();
  for (const [key, value] of fd.entries()) {
    if (!key.startsWith("price__")) continue;
    const raw = String(value).trim();
    if (!raw) continue;
    const bahtVal = Number(raw);
    if (!(bahtVal >= 0)) throw new Error("ราคาต้องไม่ติดลบ");
    wanted.set(key.slice("price__".length), Math.round(bahtVal * 100));
  }
  if (wanted.size === 0) throw new Error("ใส่ราคาอย่างน้อย 1 ประเภทห้อง");

  const supabase = await createClient();

  // กันยิงข้าม tenant — รับเฉพาะ room type ของโรงแรมนี้จริง
  const { data: rtRows } = await supabase
    .from("room_types")
    .select("id")
    .eq("hotel_id", hotel.id)
    .is("deleted_at", null)
    .in("id", [...wanted.keys()]);
  const validIds = new Set((rtRows ?? []).map((r) => r.id as string));

  const rows: {
    hotel_id: string;
    rate_plan_id: string;
    room_type_id: string;
    date: string;
    price_satang: number;
    min_stay: number;
  }[] = [];
  for (const [roomTypeId, priceSatang] of wanted) {
    if (!validIds.has(roomTypeId)) throw new Error("ไม่พบประเภทห้อง");
    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      rows.push({
        hotel_id: hotel.id,
        rate_plan_id: ratePlanId,
        room_type_id: roomTypeId,
        date: d.toISOString().slice(0, 10),
        price_satang: priceSatang,
        min_stay: minStay,
      });
    }
  }

  const { error } = await supabase
    .from("rate_prices")
    .upsert(rows, { onConflict: "rate_plan_id,room_type_id,date" });
  if (error) throw new Error(error.message);

  await supabase.rpc("log_audit", {
    p_hotel_id: hotel.id,
    p_action: "rates.season_updated",
    p_entity_type: "rate_plan",
    p_entity_id: ratePlanId,
    p_new: {
      from,
      to,
      min_stay: minStay,
      room_types: Object.fromEntries(wanted),
    },
  });
  revalidateHotel(hotelSlug, "/rates");
}
