"use server";

import { revalidatePath } from "next/cache";
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
  if (error) throw new Error(error.message);

  await supabase.rpc("log_audit", {
    p_hotel_id: hotel.id,
    p_action: "rate_plan.created",
    p_entity_type: "rate_plan",
    p_entity_id: (data as { id: string }).id,
    p_new: { name },
  });
  revalidatePath("/rates");
}

// ── bulk price setter (ตั้งราคาช่วงวัน — season) ─────────────────────────────
export async function setBulkPrices(fd: FormData) {
  const hotelSlug = fd.get("hotelSlug") as string;
  const ratePlanId = fd.get("ratePlanId") as string;
  const roomTypeId = fd.get("roomTypeId") as string;
  const from = fd.get("from") as string;
  const to = fd.get("to") as string;
  const priceBaht = Number(fd.get("price") ?? 0);
  const minStay = Number(fd.get("min_stay") ?? 1);

  const { hotel } = await requireHotelMember(hotelSlug);
  await requirePermission(hotel.id, "rates.edit");

  if (!from || !to) throw new Error("เลือกช่วงวันที่");
  const start = new Date(from + "T00:00:00Z");
  const end = new Date(to + "T00:00:00Z");
  if (end < start) throw new Error("วันสิ้นสุดต้องไม่ก่อนวันเริ่ม");
  if (priceBaht < 0) throw new Error("ราคาต้องไม่ติดลบ");

  // gen แถวทุกวัน [from, to] (inclusive — ราคาต่างจาก inventory ที่ exclusive)
  const priceSatang = Math.round(priceBaht * 100);
  const rows: {
    hotel_id: string;
    rate_plan_id: string;
    room_type_id: string;
    date: string;
    price_satang: number;
    min_stay: number;
  }[] = [];
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
  if (rows.length > 730) throw new Error("ช่วงวันยาวเกินไป (สูงสุด 2 ปี)");

  const supabase = await createClient();
  const { error } = await supabase
    .from("rate_prices")
    .upsert(rows, { onConflict: "rate_plan_id,room_type_id,date" });
  if (error) throw new Error(error.message);

  await supabase.rpc("log_audit", {
    p_hotel_id: hotel.id,
    p_action: "rates.updated",
    p_entity_type: "rate_plan",
    p_entity_id: ratePlanId,
    p_new: { from, to, price_satang: priceSatang, days: rows.length },
  });
  revalidatePath("/rates");
}
