import { requireHotelMember } from "@/lib/auth";
import { can } from "@/lib/permission";
import { hotelHref } from "@/lib/hotel/href";
import { createClient } from "@/lib/supabase/server";
import { Users, BedDouble, Layers, ChevronRight } from "lucide-react";
import { AppPage, PropertyTabs, Card, EmptyState, ButtonLink } from "@/components/ui";
import {
  RoomTypeModalButton,
  RoomTypeEditButton,
  RoomModalButton,
  RoomChips,
} from "./forms";

// หน้าห้องพัก — โครงตาม template AppPage (rules.md #17.1)
// การ์ดต่อประเภทห้อง: หัว (ชื่อ + occupancy + ค่าเสริม) · ห้องเป็น chip ลบได้ (มี confirm)

type Prop = { id: string; name: string; slug: string };
type RoomType = {
  id: string;
  name: string;
  base_occupancy: number;
  max_occupancy: number;
  extra_adult_satang: number;
  extra_child_satang: number;
  child_age_limit: number;
  monthly_rent_satang: number | null;
};
type Room = { id: string; room_number: string; floor: string | null; room_type_id: string };

function baht(satang: number): string {
  return (satang / 100).toLocaleString("th-TH");
}

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
  const activeProp = properties.find((x) => x.id === p) ?? properties[0];

  if (!activeProp) {
    return (
      <AppPage title="ห้องพัก" subtitle={hotel.name}>
        <EmptyState art="bed" title="กำลังเตรียมข้อมูลโรงแรม…" />
      </AppPage>
    );
  }

  const [{ data: rtData }, { data: roomData }] = await Promise.all([
    supabase
      .from("room_types")
      .select(
        "id, name, base_occupancy, max_occupancy, extra_adult_satang, extra_child_satang, child_age_limit, monthly_rent_satang",
      )
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
    <AppPage
      title="ห้องพัก"
      subtitle={
        roomTypes.length > 0
          ? `${hotel.name} · ${roomTypes.length} ประเภทห้อง · ${rooms.length} ห้อง`
          : hotel.name
      }
      action={
        canEdit && roomTypes.length > 0 ? (
          <RoomTypeModalButton hotelSlug={hotel.slug} propertyId={activeProp.id} />
        ) : null
      }
      tabs={
        <PropertyTabs
          show={hotel.multi_property}
          activeId={activeProp.id}
          items={properties.map((pr) => ({
            id: pr.id,
            name: pr.name,
            href: `${hotelHref("/rooms", hotel.slug)}?p=${pr.id}`,
          }))}
        />
      }
    >
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
        <div className="space-y-3">
          {roomTypes.map((rt) => {
            const typeRooms = rooms.filter((r) => r.room_type_id === rt.id);
            const floors = [
              ...new Set(typeRooms.map((r) => r.floor?.trim()).filter(Boolean)),
            ] as string[];
            return (
              <Card key={rt.id} pad={false}>
                {/* พับ/กางด้วย <details> — ประเภทเยอะจะได้เห็นแถวสรุปครบก่อน กดกางเฉพาะที่สนใจ */}
                <details className="group" open={roomTypes.length <= 2}>
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-5 py-4 transition-colors hover:bg-bg-subtle [&::-webkit-details-marker]:hidden">
                    <ChevronRight
                      size={18}
                      className="shrink-0 text-fg-subtle transition-transform group-open:rotate-90"
                    />
                    <span className="text-lg font-semibold text-fg">{rt.name}</span>

                    {/* stat อ่านปราดเดียว */}
                    <span className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-base text-fg-muted">
                      <span className="inline-flex items-center gap-1.5">
                        <Users size={16} className="text-fg-subtle" />
                        พัก {rt.base_occupancy}–{rt.max_occupancy} คน
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <BedDouble size={16} className="text-fg-subtle" />
                        {typeRooms.length} ห้อง
                      </span>
                      {floors.length > 0 && (
                        <span className="inline-flex items-center gap-1.5">
                          <Layers size={16} className="text-fg-subtle" />
                          {floors.length === 1 ? `ชั้น ${floors[0]}` : `${floors.length} ชั้น`}
                        </span>
                      )}
                      {/* ปุ่มแก้ไขอยู่ท้าย title (เจ้าของหาไม่เจอตอนอยู่ในส่วนกาง) */}
                      {canEdit && (
                        <RoomTypeEditButton
                          hotelSlug={hotel.slug}
                          propertyId={activeProp.id}
                          roomType={rt}
                        />
                      )}
                    </span>
                  </summary>

                  <div className="space-y-3 border-t border-border px-5 py-4">
                    <RoomChips
                      hotelSlug={hotel.slug}
                      rooms={typeRooms.map((r) => ({
                        id: r.id,
                        room_number: r.room_number,
                        floor: r.floor,
                      }))}
                      canEdit={canEdit}
                    />

                    {(rt.extra_adult_satang > 0 || rt.extra_child_satang > 0) && (
                      <p className="text-sm text-fg-subtle">
                        ค่าเสริมเมื่อพักเกิน {rt.base_occupancy} คน:
                        {rt.extra_adult_satang > 0 &&
                          ` ผู้ใหญ่ ${baht(rt.extra_adult_satang)}฿`}
                        {rt.extra_adult_satang > 0 && rt.extra_child_satang > 0 && " ·"}
                        {rt.extra_child_satang > 0 &&
                          ` เด็ก ${baht(rt.extra_child_satang)}฿`}
                        {" /คน/คืน"}
                      </p>
                    )}

                    {canEdit && (
                      <div className="flex items-center gap-1.5 border-t border-border pt-3">
                        <RoomModalButton
                          hotelSlug={hotel.slug}
                          propertyId={activeProp.id}
                          roomTypeId={rt.id}
                          roomTypeName={rt.name}
                          existingNumbers={rooms.map((r) => r.room_number)}
                        />
                      </div>
                    )}
                  </div>
                </details>
              </Card>
            );
          })}
        </div>
      )}

      {/* ขั้นถัดไป: ตั้งราคา — callout เด่นๆ (ห้องเปิดจองได้เมื่อมีราคา) */}
      {roomTypes.length > 0 && (
        <Card className="mt-6 border-brand/30 bg-brand-soft/40">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-base font-semibold text-fg">ขั้นถัดไป — ตั้งราคาห้องพัก</p>
              <p className="mt-0.5 text-sm text-fg-muted">
                ห้องจะเปิดรับจองได้ก็ต่อเมื่อตั้งราคาแล้ว
              </p>
            </div>
            <ButtonLink href={hotelHref("/rates", hotel.slug)} variant="primary">
              ไปตั้งราคา →
            </ButtonLink>
          </div>
        </Card>
      )}
    </AppPage>
  );
}
