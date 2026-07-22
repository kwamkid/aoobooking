import Link from "next/link";
import { requireHotelMember } from "@/lib/auth";
import { requirePermission } from "@/lib/permission";
import { hotelHref } from "@/lib/hotel/href";
import { createClient } from "@/lib/supabase/server";
import { AppPage } from "@/components/ui";
import { BookingWizard } from "./wizard";

export default async function NewBookingPage({
  params,
}: {
  params: Promise<{ hotel: string }>;
}) {
  const { hotel: hotelSlug } = await params;
  const { hotel } = await requireHotelMember(hotelSlug);
  await requirePermission(hotel.id, "bookings.create");
  const supabase = await createClient();

  // wizard ค้นหาเอง (searchAvailability สแกนทุกประเภท/แพ็กเกจ) — page ส่งแค่รายชื่อสาขา
  const { data: props } = await supabase
    .from("properties")
    .select("id, name")
    .eq("hotel_id", hotel.id)
    .is("deleted_at", null)
    .order("created_at");

  const properties = (props ?? []) as unknown as { id: string; name: string }[];

  if (properties.length === 0) {
    return (
      <AppPage
        title="จองใหม่"
        back={{ href: hotelHref("/bookings", hotel.slug), label: "การจอง" }}
      >
        <p className="text-base text-fg-muted">
          ต้องตั้งค่าห้อง/ราคาก่อน —{" "}
          <Link href={hotelHref("/settings/properties", hotel.slug)} className="text-brand underline">
            เริ่มที่นี่
          </Link>
        </p>
      </AppPage>
    );
  }

  return (
    <AppPage
      title="จองใหม่"
      subtitle={hotel.name}
      back={{ href: hotelHref("/bookings", hotel.slug), label: "การจอง" }}
    >

      <BookingWizard hotelSlug={hotel.slug} properties={properties} />
    </AppPage>
  );
}