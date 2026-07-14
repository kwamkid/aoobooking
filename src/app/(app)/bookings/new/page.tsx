import Link from "next/link";
import { requireHotelMember } from "@/lib/auth";
import { requirePermission } from "@/lib/permission";
import { hotelHref } from "@/lib/hotel/href";
import { createClient } from "@/lib/supabase/server";
import { BookingWizard } from "./wizard";

export default async function NewBookingPage({
  searchParams,
}: {
  searchParams: Promise<{ h?: string }>;
}) {
  const { h } = await searchParams;
  const { hotel } = await requireHotelMember(h);
  await requirePermission(hotel.id, "bookings.create");
  const supabase = await createClient();

  // โหลด catalog ทั้งหมด (property → room_types → rate_plans) ให้ wizard กรองฝั่ง client
  const [{ data: props }, { data: roomTypes }, { data: ratePlans }] = await Promise.all([
    supabase
      .from("properties")
      .select("id, name")
      .eq("hotel_id", hotel.id)
      .is("deleted_at", null)
      .order("created_at"),
    supabase
      .from("room_types")
      .select("id, name, property_id")
      .eq("hotel_id", hotel.id)
      .is("deleted_at", null),
    supabase
      .from("rate_plans")
      .select("id, name, property_id")
      .eq("hotel_id", hotel.id)
      .is("deleted_at", null),
  ]);

  const properties = (props ?? []) as unknown as { id: string; name: string }[];

  if (properties.length === 0) {
    return (
      <div className="mx-auto max-w-2xl p-4 sm:p-8">
        <h1 className="text-2xl font-bold text-fg">จองใหม่</h1>
        <p className="mt-4 text-fg-muted">
          ต้องตั้งค่าสาขา/ห้อง/ราคาก่อน —{" "}
          <Link href={hotelHref("/settings/properties", hotel.slug)} className="text-brand underline">
            เริ่มที่นี่
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-8">
      <div className="mb-4 flex items-center gap-3">
        <Link
          href={hotelHref("/bookings", hotel.slug)}
          className="text-sm text-fg-muted underline"
        >
          ← การจอง
        </Link>
        <h1 className="text-2xl font-bold text-fg">จองใหม่</h1>
      </div>

      <BookingWizard
        hotelSlug={hotel.slug}
        properties={properties}
        roomTypes={(roomTypes ?? []) as unknown as { id: string; name: string; property_id: string }[]}
        ratePlans={(ratePlans ?? []) as unknown as { id: string; name: string; property_id: string }[]}
      />
    </div>
  );
}
