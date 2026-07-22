import { createClient } from "@/lib/supabase/server";

// สถานะ onboarding checklist — นับของจริงต่อ hotel เพื่อบอกว่า setup ถึงไหนแล้ว
// step ทั้งหมดผูกกับ "เส้นทางไปสู่การรับจองแรก": ห้อง → ราคา → (ทีม) → จองแรก
// property มี default อยู่แล้วตั้งแต่สร้าง hotel จึงไม่นับเป็น step (ใช้เป็นจุดตั้งค่า)

export type SetupStep = {
  key: string;
  title: string;
  description: string;
  href: string; // path หลัง /[hotel] (ยังไม่ prefix slug)
  done: boolean;
  optional?: boolean;
};

export type SetupStatus = {
  steps: SetupStep[];
  requiredDone: number;
  requiredTotal: number;
  allRequiredDone: boolean;
};

export async function getSetupStatus(hotelId: string): Promise<SetupStatus> {
  const supabase = await createClient();

  // property ids ของ hotel (room/rate ผูกที่ property_id)
  const { data: propsData } = await supabase
    .from("properties")
    .select("id")
    .eq("hotel_id", hotelId)
    .is("deleted_at", null);
  const propertyIds = (propsData ?? []).map((p) => p.id as string);

  // นับพร้อมกัน — head:true ดึงแค่ count ไม่ดึง row
  const roomsQ = supabase
    .from("rooms")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null);
  // ราคา = ตั้ง "ราคาปกติ" (rate_base_prices — โมเดลใหม่ 2026-07-16) หรือมี override
  // รายวัน (rate_prices) ก็นับว่าตั้งแล้ว — เช็คทั้งคู่ กัน checklist ค้างเหมือนบั๊กเดิม
  const basePricesQ = supabase
    .from("rate_base_prices")
    .select("rate_plan_id", { count: "exact", head: true })
    .eq("hotel_id", hotelId);
  const pricesQ = supabase
    .from("rate_prices")
    .select("id", { count: "exact", head: true })
    .eq("hotel_id", hotelId);
  const membersQ = supabase
    .from("hotel_members")
    .select("user_id", { count: "exact", head: true })
    .eq("hotel_id", hotelId);
  const bookingsQ = supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("hotel_id", hotelId);

  // rooms ผูก property_id (ไม่มี hotel_id ตรงๆ) → filter ด้วย property list
  if (propertyIds.length > 0) {
    roomsQ.in("property_id", propertyIds);
  } else {
    // ยังไม่มี property (ไม่น่าเกิดเพราะ default) → กันไว้: บังคับ count = 0
    roomsQ.eq("property_id", "00000000-0000-0000-0000-000000000000");
  }

  const [rooms, basePrices, prices, members, bookings] = await Promise.all([
    roomsQ,
    basePricesQ,
    pricesQ,
    membersQ,
    bookingsQ,
  ]);

  const hasRooms = (rooms.count ?? 0) > 0;
  const hasPrices = (basePrices.count ?? 0) > 0 || (prices.count ?? 0) > 0;
  const hasTeam = (members.count ?? 0) > 1; // มากกว่าเจ้าของ 1 คน
  const hasBooking = (bookings.count ?? 0) > 0;

  const steps: SetupStep[] = [
    {
      key: "rooms",
      title: "เพิ่มห้องพัก",
      description: "สร้างประเภทห้อง แล้วเพิ่มห้องจริงในแต่ละประเภท",
      href: "/rooms",
      done: hasRooms,
    },
    {
      key: "rates",
      title: "ตั้งราคา",
      description: "ตั้งราคาปกติของแต่ละประเภทห้อง — ครั้งเดียวจบ",
      href: "/rates",
      done: hasPrices,
    },
    {
      key: "team",
      title: "เชิญทีมงาน",
      description: "เพิ่มพนักงานหน้าเคาน์เตอร์หรือแม่บ้าน (ไม่บังคับ)",
      href: "/settings/properties",
      done: hasTeam,
      optional: true,
    },
    {
      key: "booking",
      title: "รับจองแรก",
      description: "ลองสร้างการจองแรกเพื่อเริ่มใช้งานจริง",
      href: "/bookings/new",
      done: hasBooking,
    },
  ];

  const required = steps.filter((s) => !s.optional);
  const requiredDone = required.filter((s) => s.done).length;

  return {
    steps,
    requiredDone,
    requiredTotal: required.length,
    allRequiredDone: requiredDone === required.length,
  };
}
