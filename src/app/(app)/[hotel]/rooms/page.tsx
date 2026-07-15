import Link from "next/link";
import { requireHotelMember } from "@/lib/auth";
import { can } from "@/lib/permission";
import { hotelHref } from "@/lib/hotel/href";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { RoomTypeModalButton, RoomModalButton } from "./forms";
import { deleteRoom } from "./actions";

type Prop = { id: string; name: string; slug: string };
type RoomType = {
  id: string;
  name: string;
  base_occupancy: number;
  max_occupancy: number;
  extra_adult_satang: number;
  extra_child_satang: number;
};
type Room = { id: string; room_number: string; floor: string | null; room_type_id: string };

export default async function RoomsPage({
  params,
  searchParams,
}: {
  params: Promise<{ hotel: string }>;
  searchParams: Promise<{ p?: string }>;
}) {
  const { hotel: hotelSlug } = await params;
  const { p } = await searchParams;
  const { hotel } = await requireHotelMember(hotelSlug);
  const canEdit = await can(hotel.id, "rooms.edit");
  const supabase = await createClient();

  const { data: propsData } = await supabase
    .from("properties")
    .select("id, name, slug")
    .eq("hotel_id", hotel.id)
    .is("deleted_at", null)
    .order("created_at");
  const properties = (propsData ?? []) as unknown as Prop[];

  if (properties.length === 0) {
    return (
      <div className="p-4 sm:p-8">
        <PageHeader title="ห้องพัก" subtitle={hotel.name} />
        <EmptyState
          art="bed"
          title="ยังไม่มีสาขา"
          description={
            <>
              เพิ่มสาขาก่อนจึงจะจัดการห้องพักได้{" "}
              <Link
                href={hotelHref("/settings/properties", hotel.slug)}
                className="text-brand underline"
              >
                เพิ่มสาขา
              </Link>
            </>
          }
        />
      </div>
    );
  }

  const activeProp = properties.find((x) => x.id === p) ?? properties[0];

  const [{ data: rtData }, { data: roomData }] = await Promise.all([
    supabase
      .from("room_types")
      .select("id, name, base_occupancy, max_occupancy, extra_adult_satang, extra_child_satang")
      .eq("property_id", activeProp.id)
      .is("deleted_at", null)
      .order("sort_order"),
    supabase
      .from("rooms")
      .select("id, room_number, floor, room_type_id")
      .eq("property_id", activeProp.id)
      .is("deleted_at", null)
      .order("room_number"),
  ]);
  const roomTypes = (rtData ?? []) as unknown as RoomType[];
  const rooms = (roomData ?? []) as unknown as Room[];

  return (
    <div className="p-4 sm:p-8">
      <PageHeader
        title="ห้องพัก"
        subtitle={hotel.name}
        action={
          canEdit && roomTypes.length > 0 ? (
            <RoomTypeModalButton hotelSlug={hotel.slug} propertyId={activeProp.id} />
          ) : null
        }
      />

      {/* property switcher — โชว์เฉพาะโรงแรมหลายสาขา */}
      {hotel.multi_property && (
        <div className="flex flex-wrap gap-2">
          {properties.map((pr) => (
            <Link
              key={pr.id}
              href={`${hotelHref("/rooms", hotel.slug)}?p=${pr.id}`}
              className={`rounded-full px-3 py-1 text-sm ${
                pr.id === activeProp.id
                  ? "bg-brand text-brand-fg"
                  : "border border-border text-fg-muted"
              }`}
            >
              {pr.name}
            </Link>
          ))}
        </div>
      )}

      {/* room types */}
      <section className="mt-8">
        {roomTypes.length === 0 ? (
          <EmptyState
            art="bed"
            title="ยังไม่มีประเภทห้อง"
            description="เริ่มจากสร้างประเภทห้อง (เช่น Deluxe, Superior) แล้วค่อยเพิ่มห้องจริงเข้าไปในแต่ละประเภท"
            action={
              canEdit ? (
                <RoomTypeModalButton hotelSlug={hotel.slug} propertyId={activeProp.id} />
              ) : undefined
            }
          />
        ) : (
          <h2 className="mb-3 text-lg font-semibold text-fg">ประเภทห้อง</h2>
        )}
        <div className="space-y-4">
          {roomTypes.map((rt) => {
            const typeRooms = rooms.filter((r) => r.room_type_id === rt.id);
            return (
              <Card key={rt.id}>
                <div className="flex items-baseline justify-between">
                  <div>
                    <span className="text-base font-medium text-fg">{rt.name}</span>
                    <span className="ml-2 text-sm text-fg-muted">
                      พัก {rt.base_occupancy}–{rt.max_occupancy} คน · ผู้ใหญ่เพิ่ม{" "}
                      {(rt.extra_adult_satang / 100).toLocaleString()}฿
                    </span>
                  </div>
                  <span className="text-sm text-fg-subtle">{typeRooms.length} ห้อง</span>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {typeRooms.length === 0 && (
                    <span className="text-sm text-fg-subtle">
                      ยังไม่มีห้องในประเภทนี้
                    </span>
                  )}
                  {typeRooms.map((r) => (
                    <span
                      key={r.id}
                      className="inline-flex items-center gap-1 rounded border border-border px-2 py-0.5 text-sm text-fg"
                    >
                      {r.room_number}
                      {r.floor ? `·ชั้น${r.floor}` : ""}
                      {canEdit && (
                        <form action={deleteRoom} className="inline">
                          <input type="hidden" name="hotelSlug" value={hotel.slug} />
                          <input type="hidden" name="roomId" value={r.id} />
                          <button className="ml-1 text-danger" title="ลบห้อง">
                            ×
                          </button>
                        </form>
                      )}
                    </span>
                  ))}
                </div>

                {canEdit && (
                  <div className="mt-3">
                    <RoomModalButton
                      hotelSlug={hotel.slug}
                      propertyId={activeProp.id}
                      roomTypeId={rt.id}
                      roomTypeName={rt.name}
                    />
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}
