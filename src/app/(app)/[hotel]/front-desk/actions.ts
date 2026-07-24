"use server";

import { revalidateHotel } from "@/lib/hotel/revalidate";
import { requireHotelMember } from "@/lib/auth";
import { can } from "@/lib/permission";
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
  revalidateHotel(hotelSlug, "/front-desk", "/bookings", "/calendar");
}

// ── ห้องว่างให้เลือกตอนเช็คอิน (จอง = ประเภทห้อง · เช็คอิน = assign เบอร์จริง) ──
export type CheckInRoom = {
  id: string;
  room_number: string;
  floor: string | null;
  housekeeping: "clean" | "dirty" | "inspected" | "out_of_order";
  /** เลือกไม่ได้: มีแขกพักอยู่ / ถูก block ช่วงเข้าพัก / งดใช้ห้อง */
  unavailable: "occupied" | "blocked" | "out_of_order" | null;
};

export type CheckInInfo = {
  /** booking_rooms ของการจอง (1 แถว/ห้อง) — จับคู่กับห้องที่เลือกตามลำดับ */
  bookingRoomIds: string[];
  roomTypeName: string;
  rooms: CheckInRoom[];
  /** วันจองเดิม — modal ใช้เช็คเคสแขกมาช้ากว่าวันเข้าพัก (late check-in) */
  checkIn: string;
  checkOut: string;
  /** มีสิทธิ์เลื่อนวัน (bookings.change_date) — คุมว่าจะโชว์ตัวเลือกปรับวันไหม */
  canChangeDates: boolean;
};

export async function getCheckInRooms(
  hotelSlug: string,
  bookingId: string,
): Promise<CheckInInfo> {
  const { hotel } = await requireHotelMember(hotelSlug);
  const supabase = await createClient();

  const { data: booking } = await supabase
    .from("bookings")
    .select("id, check_in, check_out, booking_rooms(id, room_type_id, room_type:room_types(name))")
    .eq("id", bookingId)
    .eq("hotel_id", hotel.id)
    .maybeSingle();
  if (!booking) throw new Error("ไม่พบการจอง");

  const brs = (booking.booking_rooms ?? []) as {
    id: string;
    room_type_id: string;
    room_type: { name: string } | null;
  }[];
  if (brs.length === 0) throw new Error("การจองไม่มีห้อง");
  const roomTypeId = brs[0].room_type_id;

  const [{ data: roomRows }, { data: occupiedRows }, { data: blockRows }] = await Promise.all([
    supabase
      .from("rooms")
      .select("id, room_number, floor, housekeeping_status")
      .eq("room_type_id", roomTypeId)
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("room_number"),
    // ห้องที่มีแขกพักอยู่ตอนนี้ (assign แล้ว + สถานะ checked_in)
    supabase
      .from("booking_rooms")
      .select("room_id, booking:bookings!inner(status)")
      .not("room_id", "is", null)
      .eq("booking.status", "checked_in"),
    // ห้องที่ถูก block คาบเกี่ยวช่วงเข้าพัก (ซ่อม/เช่ารายเดือน)
    supabase
      .from("room_blocks")
      .select("room_id")
      .lt("start_date", booking.check_out)
      .gt("end_date", booking.check_in),
  ]);

  const occupied = new Set((occupiedRows ?? []).map((r) => r.room_id as string));
  const blocked = new Set((blockRows ?? []).map((r) => r.room_id as string));

  return {
    bookingRoomIds: brs.map((b) => b.id),
    roomTypeName: brs[0].room_type?.name ?? "",
    checkIn: booking.check_in,
    checkOut: booking.check_out,
    canChangeDates: await can(hotel.id, "bookings.change_date"),
    rooms: ((roomRows ?? []) as { id: string; room_number: string; floor: string | null; housekeeping_status: CheckInRoom["housekeeping"] }[]).map(
      (r) => ({
        id: r.id,
        room_number: r.room_number,
        floor: r.floor,
        housekeeping: r.housekeeping_status,
        unavailable: occupied.has(r.id)
          ? "occupied"
          : blocked.has(r.id)
            ? "blocked"
            : r.housekeeping_status === "out_of_order"
              ? "out_of_order"
              : null,
      }),
    ),
  };
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
  revalidateHotel(hotelSlug, "/front-desk", "/bookings", "/calendar");
}
