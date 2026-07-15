"use server";

import { revalidateHotel } from "@/lib/hotel/revalidate";
import { requireHotelMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// check-in: assign ห้องว่าง+clean แล้วเรียก RPC (RPC เช็คสิทธิ์+guard เอง)
export async function checkInBooking(fd: FormData) {
  const hotelSlug = fd.get("hotelSlug") as string;
  const bookingId = fd.get("bookingId") as string;
  // room_assignments อาจส่งมาเป็น JSON (booking_room_id → room_id) จาก UI เลือกห้อง
  const assignmentsRaw = fd.get("assignments") as string | null;
  const assignments = assignmentsRaw ? JSON.parse(assignmentsRaw) : [];

  await requireHotelMember(hotelSlug); // ยืนยัน membership (RPC เช็ค permission)
  const supabase = await createClient();
  const { error } = await supabase.rpc("check_in_booking", {
    p_booking_id: bookingId,
    p_room_assignments: assignments,
  });
  if (error) throw new Error(error.message);
  revalidateHotel(hotelSlug, "/front-desk");
}

// check-out: RPC block ถ้า balance ≠ 0
export async function checkOutBooking(fd: FormData) {
  const hotelSlug = fd.get("hotelSlug") as string;
  const bookingId = fd.get("bookingId") as string;

  await requireHotelMember(hotelSlug);
  const supabase = await createClient();
  const { error } = await supabase.rpc("check_out_booking", {
    p_booking_id: bookingId,
  });
  if (error) throw new Error(error.message);
  revalidateHotel(hotelSlug, "/front-desk");
}
