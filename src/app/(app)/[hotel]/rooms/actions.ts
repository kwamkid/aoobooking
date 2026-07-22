"use server";

import { revalidateHotel } from "@/lib/hotel/revalidate";
import { parseRoomNumbers } from "@/lib/hotel/room-numbers";
import { requireHotelMember } from "@/lib/auth";
import { requirePermission } from "@/lib/permission";
import { createClient } from "@/lib/supabase/server";

// ── room types ──────────────────────────────────────────────────────────────
// "เว้นว่าง" = null (ไม่เปิดรายเดือน) · มีค่า = satang
function monthlyRentFromForm(fd: FormData): number | null {
  const raw = (fd.get("monthly_rent") as string | null)?.trim();
  if (!raw) return null;
  const baht = Number(raw);
  return baht >= 0 ? Math.round(baht * 100) : null;
}

export async function createRoomType(fd: FormData) {
  const hotelSlug = fd.get("hotelSlug") as string;
  const propertyId = fd.get("propertyId") as string;
  const { hotel } = await requireHotelMember(hotelSlug);
  await requirePermission(hotel.id, "rooms.edit");

  const name = (fd.get("name") as string)?.trim();
  if (!name) throw new Error("กรุณาใส่ชื่อประเภทห้อง");
  const base = Number(fd.get("base_occupancy") ?? 2);
  const max = Number(fd.get("max_occupancy") ?? 2);
  if (max < base) throw new Error("occupancy สูงสุดต้อง ≥ occupancy พื้นฐาน");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("room_types")
    .insert({
      hotel_id: hotel.id,
      property_id: propertyId,
      name,
      description: (fd.get("description") as string) || null,
      base_occupancy: base,
      max_occupancy: max,
      extra_adult_satang: Math.round(Number(fd.get("extra_adult") ?? 0) * 100),
      extra_child_satang: Math.round(Number(fd.get("extra_child") ?? 0) * 100),
      child_age_limit: Number(fd.get("child_age_limit") ?? 12),
      monthly_rent_satang: monthlyRentFromForm(fd),
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await supabase.rpc("log_audit", {
    p_hotel_id: hotel.id,
    p_action: "room_type.created",
    p_entity_type: "room_type",
    p_entity_id: (data as { id: string }).id,
    p_new: { name },
  });
  // /rates ลิสต์ประเภทห้องด้วย → ล้างพร้อมกัน
  revalidateHotel(hotelSlug, "/rooms", "/rates");
}

export async function updateRoomType(fd: FormData) {
  const hotelSlug = fd.get("hotelSlug") as string;
  const roomTypeId = fd.get("roomTypeId") as string;
  const { hotel } = await requireHotelMember(hotelSlug);
  await requirePermission(hotel.id, "rooms.edit");

  const name = (fd.get("name") as string)?.trim();
  if (!name) throw new Error("กรุณาใส่ชื่อประเภทห้อง");
  const base = Number(fd.get("base_occupancy") ?? 2);
  const max = Number(fd.get("max_occupancy") ?? 2);
  if (max < base) throw new Error("พักได้สูงสุดต้อง ≥ พักปกติ");

  const supabase = await createClient();
  const { error } = await supabase
    .from("room_types")
    .update({
      name,
      base_occupancy: base,
      max_occupancy: max,
      extra_adult_satang: Math.round(Number(fd.get("extra_adult") ?? 0) * 100),
      extra_child_satang: Math.round(Number(fd.get("extra_child") ?? 0) * 100),
      child_age_limit: Number(fd.get("child_age_limit") ?? 12),
      monthly_rent_satang: monthlyRentFromForm(fd),
      updated_at: new Date().toISOString(),
    })
    .eq("id", roomTypeId)
    .eq("hotel_id", hotel.id); // กันแก้ข้าม tenant
  if (error) throw new Error(error.message);

  await supabase.rpc("log_audit", {
    p_hotel_id: hotel.id,
    p_action: "room_type.updated",
    p_entity_type: "room_type",
    p_entity_id: roomTypeId,
    p_new: { name, base_occupancy: base, max_occupancy: max },
  });
  revalidateHotel(hotelSlug, "/rooms", "/rates");
}

// ลบประเภทห้อง (soft delete) — ต้องไม่มีห้อง active + ไม่มีการจองในอนาคต
export async function deleteRoomType(fd: FormData) {
  const hotelSlug = fd.get("hotelSlug") as string;
  const roomTypeId = fd.get("roomTypeId") as string;
  const { hotel } = await requireHotelMember(hotelSlug);
  await requirePermission(hotel.id, "rooms.edit");

  const supabase = await createClient();

  // guard 1: ยังมีห้องอยู่ → ให้ลบห้องก่อน (แต่ละห้องมี confirm ของตัวเอง)
  const { count: roomCount } = await supabase
    .from("rooms")
    .select("id", { count: "exact", head: true })
    .eq("room_type_id", roomTypeId)
    .is("deleted_at", null);
  if ((roomCount ?? 0) > 0) {
    throw new Error(`ยังมีห้องอยู่ ${roomCount} ห้อง — ลบห้องข้างในออกก่อน`);
  }

  // guard 2: มีการจองในอนาคตที่ยังไม่ยกเลิก → ห้ามลบ (ข้อมูลรายได้/แขกยังผูกอยู่)
  const today = new Date().toISOString().slice(0, 10);
  const { data: futureBk } = await supabase
    .from("booking_rooms")
    .select("booking_id, bookings!inner(status)")
    .eq("room_type_id", roomTypeId)
    .gte("end_date", today)
    .in("bookings.status", ["pending", "confirmed", "checked_in"])
    .limit(1);
  if ((futureBk ?? []).length > 0) {
    throw new Error("มีการจองในอนาคตผูกกับประเภทห้องนี้ — ยกเลิกการจองก่อน");
  }

  const { error } = await supabase
    .from("room_types")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", roomTypeId)
    .eq("hotel_id", hotel.id);
  if (error) throw new Error(error.message);

  await supabase.rpc("log_audit", {
    p_hotel_id: hotel.id,
    p_action: "room_type.deleted",
    p_entity_type: "room_type",
    p_entity_id: roomTypeId,
  });
  revalidateHotel(hotelSlug, "/rooms", "/rates");
}

// ── rooms ────────────────────────────────────────────────────────────────────
// รับได้ทั้ง "101" · "101,102,105" · "101-110" · ผสมกัน (ดู lib/hotel/room-numbers.ts)
// เขียนผ่าน RPC create_rooms_bulk เท่านั้น — atomic (สิทธิ์+limit+ซ้ำ+insert ใน transaction เดียว)
// ห้ามกลับไป insert ตรงจาก app: race กันจนเกิน limit / ชน unique ได้ (bugs.md §Rooms)
export async function createRoom(
  fd: FormData,
): Promise<{ added: number; skipped: string[]; restored: number }> {
  const hotelSlug = fd.get("hotelSlug") as string;
  const propertyId = fd.get("propertyId") as string;
  const roomTypeId = fd.get("roomTypeId") as string;
  const { hotel } = await requireHotelMember(hotelSlug);
  await requirePermission(hotel.id, "rooms.edit"); // ชั้น app (RPC เช็คซ้ำอีกชั้น)

  const parsed = parseRoomNumbers((fd.get("room_number") as string) ?? "");
  if (!parsed.ok) throw new Error(parsed.error);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_rooms_bulk", {
    p_hotel_id: hotel.id,
    p_property_id: propertyId,
    p_room_type_id: roomTypeId,
    p_room_numbers: parsed.rooms,
    p_floor: (fd.get("floor") as string)?.trim() || undefined,
  });
  if (error) throw new Error(error.message);

  const res = data as unknown as {
    added: number;
    skipped: string[];
    restored: number;
  };

  // ไม่มีอะไรเพิ่มเลย = ซ้ำทั้งหมด → บอกให้ชัดว่าเพราะอะไร
  if (res.added === 0) {
    throw new Error(
      res.skipped.length === 1
        ? `ห้อง ${res.skipped[0]} มีอยู่แล้วในสาขานี้`
        : `ห้อง ${res.skipped.join(", ")} มีอยู่แล้วทั้งหมด`,
    );
  }

  revalidateHotel(hotelSlug, "/rooms");
  return res;
}

export async function deleteRoom(fd: FormData) {
  const hotelSlug = fd.get("hotelSlug") as string;
  const roomId = fd.get("roomId") as string;
  const { hotel } = await requireHotelMember(hotelSlug);
  await requirePermission(hotel.id, "rooms.edit");

  const supabase = await createClient();
  // soft delete → trigger recalc total (วันอนาคต) · ถ้ามีแขก booked เกิน total ใหม่ = constraint กัน
  const { error } = await supabase
    .from("rooms")
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq("id", roomId)
    .eq("hotel_id", hotel.id);
  if (error) throw new Error(error.message);

  await supabase.rpc("log_audit", {
    p_hotel_id: hotel.id,
    p_action: "room.deleted",
    p_entity_type: "room",
    p_entity_id: roomId,
  });
  revalidateHotel(hotelSlug, "/rooms");
}
