"use server";

import { revalidateHotel } from "@/lib/hotel/revalidate";
import { requireHotelMember } from "@/lib/auth";
import { requirePermission } from "@/lib/permission";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type FolioCategory = Database["public"]["Enums"]["folio_item_category"];

/* Folio actions — เพิ่ม/void รายการค่าใช้จ่าย ผ่าน RPC (SECURITY DEFINER
 * เช็ค user_can + VAT/SC snapshot + audit ในตัว — migration 000034) */

// หมวดที่เพิ่มมือได้ (room = ระบบ post เอง · vat/sc = snapshot ในรายการ)
const ADDABLE: FolioCategory[] = ["food", "minibar", "laundry", "spa", "other"];

export type NewFolioItem = {
  category: FolioCategory;
  description: string;
  qty: number;
  /** บาท (แปลงเป็น satang ที่นี่ — rules #1) */
  unitPriceBaht: number;
};

// เพิ่มได้หลายรายการในครั้งเดียว (เจ้าของขอ 2026-07-22 — ไม่ต้องกดเปิด modal วนซ้ำ)
// validate ครบทุกแถวก่อน แล้วค่อย post ทีละแถว (แถวแรก error เรื่องสิทธิ์/สถานะ = หยุดทันที)
export async function addFolioItems(fd: FormData): Promise<void> {
  const hotelSlug = fd.get("hotelSlug") as string;
  const bookingId = fd.get("bookingId") as string;

  const { hotel } = await requireHotelMember(hotelSlug);
  await requirePermission(hotel.id, "folio.add_charge");

  let items: NewFolioItem[];
  try {
    items = JSON.parse((fd.get("items") as string) || "[]");
  } catch {
    throw new Error("ข้อมูลรายการไม่ถูกต้อง");
  }
  if (!Array.isArray(items) || items.length === 0) throw new Error("ยังไม่มีรายการ");

  const rows = items.map((it, idx) => {
    const n = idx + 1;
    if (!ADDABLE.includes(it.category)) throw new Error(`แถวที่ ${n}: หมวดไม่ถูกต้อง`);
    const description = (it.description || "").trim();
    if (!description) throw new Error(`แถวที่ ${n}: กรอกรายละเอียด`);
    const qty = Math.floor(Number(it.qty));
    if (!Number.isFinite(qty) || qty < 1) throw new Error(`แถวที่ ${n}: จำนวนต้องอย่างน้อย 1`);
    const unitSatang = Math.round(Number(it.unitPriceBaht) * 100);
    if (!Number.isFinite(unitSatang) || unitSatang <= 0) {
      throw new Error(`แถวที่ ${n}: ราคาต่อหน่วยต้องมากกว่า 0`);
    }
    return { category: it.category, description, qty, unitSatang };
  });

  const supabase = await createClient();
  for (const r of rows) {
    const { error } = await supabase.rpc("post_folio_item", {
      p_booking_id: bookingId,
      p_category: r.category,
      p_description: r.description,
      p_qty: r.qty,
      p_unit_price_satang: r.unitSatang,
    });
    if (error) throw new Error(error.message);
  }

  revalidateHotel(hotelSlug, `/bookings/${bookingId}`, "/bookings", "/reports");
}

// ── แก้การจอง: เลื่อนวัน / ย้ายประเภทห้อง — RPC จัดการ inventory+ราคา+folio
// ใน transaction เดียว (migration 000037) · คืน diff ให้ UI บอกยอดเปลี่ยน ────
export type RepriceResult = {
  oldTotalSatang: number;
  newTotalSatang: number;
  diffSatang: number;
};

function toReprice(data: unknown): RepriceResult {
  const d = data as { old_total_satang: number; new_total_satang: number; diff_satang: number };
  return {
    oldTotalSatang: d.old_total_satang,
    newTotalSatang: d.new_total_satang,
    diffSatang: d.diff_satang,
  };
}

export async function changeBookingDates(fd: FormData): Promise<RepriceResult> {
  const hotelSlug = fd.get("hotelSlug") as string;
  const bookingId = fd.get("bookingId") as string;
  const checkIn = fd.get("checkIn") as string;
  const checkOut = fd.get("checkOut") as string;

  const { hotel } = await requireHotelMember(hotelSlug);
  await requirePermission(hotel.id, "bookings.change_date");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("change_booking_dates", {
    p_booking_id: bookingId,
    p_new_check_in: checkIn,
    p_new_check_out: checkOut,
  });
  if (error) throw new Error(error.message);

  revalidateHotel(hotelSlug, `/bookings/${bookingId}`, "/bookings", "/front-desk", "/calendar");
  return toReprice(data);
}

export async function changeBookingRoomType(fd: FormData): Promise<RepriceResult> {
  const hotelSlug = fd.get("hotelSlug") as string;
  const bookingId = fd.get("bookingId") as string;
  const roomTypeId = fd.get("roomTypeId") as string;

  const { hotel } = await requireHotelMember(hotelSlug);
  await requirePermission(hotel.id, "bookings.move_room");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("change_booking_room_type", {
    p_booking_id: bookingId,
    p_new_room_type_id: roomTypeId,
  });
  if (error) throw new Error(error.message);

  revalidateHotel(hotelSlug, `/bookings/${bookingId}`, "/bookings", "/front-desk", "/calendar");
  return toReprice(data);
}

export async function voidFolioItem(fd: FormData): Promise<void> {
  const hotelSlug = fd.get("hotelSlug") as string;
  const bookingId = fd.get("bookingId") as string;
  const itemId = fd.get("itemId") as string;
  const reason = ((fd.get("reason") as string) || "").trim();

  const { hotel } = await requireHotelMember(hotelSlug);
  await requirePermission(hotel.id, "folio.void_charge");
  if (!reason) throw new Error("ต้องระบุเหตุผลที่ยกเลิกรายการ");

  const supabase = await createClient();
  const { error } = await supabase.rpc("void_folio_item", {
    p_item_id: itemId,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);

  revalidateHotel(hotelSlug, `/bookings/${bookingId}`, "/bookings", "/reports");
}
