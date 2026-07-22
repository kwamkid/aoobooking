"use server";

import { revalidateHotel } from "@/lib/hotel/revalidate";
import { requireHotelMember } from "@/lib/auth";
import { requirePermission } from "@/lib/permission";
import { createClient } from "@/lib/supabase/server";

// โมดูลเช่ารายเดือน — เขียนผ่าน RPC เท่านั้น (atomic: เช็คว่าง + block ห้อง + audit
// ใน transaction เดียว · เช็คโมดูลตามแพ็กเกจที่ชั้น DB ด้วย hotel_monthly_enabled)

export async function createTenancy(fd: FormData) {
  const hotelSlug = fd.get("hotelSlug") as string;
  const { hotel } = await requireHotelMember(hotelSlug);
  await requirePermission(hotel.id, "bookings.create");

  const roomId = fd.get("roomId") as string;
  const startDate = fd.get("startDate") as string;
  const rentBaht = Number(fd.get("rent") ?? 0);
  const depositBaht = Number(fd.get("deposit") ?? 0);
  const guestName = (fd.get("guestName") as string)?.trim();
  const guestPhone = (fd.get("guestPhone") as string)?.trim();
  if (!roomId) throw new Error("เลือกห้อง");
  if (!startDate) throw new Error("เลือกวันเริ่มสัญญา");
  if (!guestName) throw new Error("กรุณาใส่ชื่อผู้เช่า");
  if (!(rentBaht > 0)) throw new Error("ค่าเช่าต้องมากกว่า 0");

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_tenancy", {
    p_hotel_id: hotel.id,
    p_room_id: roomId,
    p_start_date: startDate,
    p_rent_satang: Math.round(rentBaht * 100),
    p_deposit_satang: Math.round(Math.max(depositBaht, 0) * 100),
    p_guest: { full_name: guestName, phone: guestPhone || null },
  });
  if (error) throw new Error(error.message);

  // block ห้องกระทบห้องว่างรายวันด้วย
  revalidateHotel(hotelSlug, "/tenants", "/calendar", "/rooms", "/bookings");
}

export async function endTenancy(fd: FormData) {
  const hotelSlug = fd.get("hotelSlug") as string;
  const tenancyId = fd.get("tenancyId") as string;
  const { hotel } = await requireHotelMember(hotelSlug);
  await requirePermission(hotel.id, "bookings.edit");

  const supabase = await createClient();
  const { error } = await supabase.rpc("end_tenancy", {
    p_tenancy_id: tenancyId,
    // ไม่ส่ง p_end_date = ย้ายออกวันนี้
  });
  if (error) throw new Error(error.message);

  revalidateHotel(hotelSlug, "/tenants", "/calendar", "/rooms", "/bookings");
}
