"use server";

import { revalidateHotel } from "@/lib/hotel/revalidate";
import { requireHotelMember } from "@/lib/auth";
import { requirePermission } from "@/lib/permission";
import { assertWithinLimit } from "@/lib/package/resolve-access";
import { createClient } from "@/lib/supabase/server";

// ── room types ──────────────────────────────────────────────────────────────
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

// ── rooms ────────────────────────────────────────────────────────────────────
export async function createRoom(fd: FormData) {
  const hotelSlug = fd.get("hotelSlug") as string;
  const propertyId = fd.get("propertyId") as string;
  const roomTypeId = fd.get("roomTypeId") as string;
  const { hotel } = await requireHotelMember(hotelSlug);
  await requirePermission(hotel.id, "rooms.edit");

  const roomNumber = (fd.get("room_number") as string)?.trim();
  if (!roomNumber) throw new Error("กรุณาใส่เลขห้อง");

  // เช็ค limit ห้องรวมทุกสาขา ก่อน insert
  await assertWithinLimit(hotel.id, "rooms");

  const supabase = await createClient();
  // trigger rooms_inventory_sync จะ seed + recalc inventory ให้อัตโนมัติ
  const { data, error } = await supabase
    .from("rooms")
    .insert({
      hotel_id: hotel.id,
      property_id: propertyId,
      room_type_id: roomTypeId,
      room_number: roomNumber,
      floor: (fd.get("floor") as string) || null,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") throw new Error(`ห้อง ${roomNumber} มีอยู่แล้วในสาขานี้`);
    throw new Error(error.message);
  }

  await supabase.rpc("log_audit", {
    p_hotel_id: hotel.id,
    p_action: "room.created",
    p_entity_type: "room",
    p_entity_id: (data as { id: string }).id,
    p_new: { room_number: roomNumber },
  });
  revalidateHotel(hotelSlug, "/rooms");
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
