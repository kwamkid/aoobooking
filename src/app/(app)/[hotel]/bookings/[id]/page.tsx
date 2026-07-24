import Link from "next/link";
import { notFound } from "next/navigation";
import { requireHotelMember } from "@/lib/auth";
import { canMany } from "@/lib/permission";
import { hotelHref } from "@/lib/hotel/href";
import { createClient } from "@/lib/supabase/server";
import { AppPage, Badge, BOOKING_STATUS_TONE, Card, RoomBadge } from "@/components/ui";
import { DetailActions } from "./detail-actions";
import { EditBookingButtons } from "./edit-booking";
import { FolioSection, type FolioItemRow } from "./folio-section";

/* หน้ารายละเอียดการจอง — ศูนย์รวม: แขก / ห้อง / สถานะ+action / folio / ยอดเงิน
 * (devplan "ทำการจองให้สมบูรณ์" ข้อ 1 — 2026-07-21) */

const STATUS_TH: Record<string, string> = {
  pending: "รอยืนยัน",
  confirmed: "ยืนยันแล้ว",
  checked_in: "เข้าพักอยู่",
  checked_out: "เช็คเอาท์แล้ว",
  cancelled: "ยกเลิก",
  no_show: "ไม่มาเข้าพัก",
};
const CHANNEL_TH: Record<string, string> = {
  front_desk: "หน้าเคาน์เตอร์",
  phone: "โทรจอง",
  walk_in: "Walk-in",
  booking_engine: "จองผ่านเว็บ",
  ota_agoda: "Agoda",
  ota_booking: "Booking.com",
  ota_trip: "Trip.com",
  ota_other: "OTA อื่น",
};

function baht(satang: number): string {
  return (satang / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 });
}
function thDate(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("th-TH", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
}
function thDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ hotel: string; id: string }>;
}) {
  const { hotel: hotelSlug, id } = await params;
  const { hotel } = await requireHotelMember(hotelSlug);
  const supabase = await createClient();

  // สิทธิ์ทั้งหน้าในรอบเดียว (เดิม 13 RPC call — ลดโหลดต่อหน้า 2026-07-24)
  const p = await canMany(hotel.id, [
    "bookings.edit",
    "bookings.cancel",
    "bookings.checkin",
    "bookings.checkout",
    "payments.view",
    "payments.charge",
    "payments.verify_slip",
    "payments.void",
    "payments.refund",
    "folio.add_charge",
    "folio.void_charge",
    "bookings.change_date",
    "bookings.move_room",
  ] as const);
  const canEdit = p["bookings.edit"];
  const canCancel = p["bookings.cancel"];
  const canCheckin = p["bookings.checkin"];
  const canCheckout = p["bookings.checkout"];
  const canPayView = p["payments.view"];
  const canPayCharge = p["payments.charge"];
  const canPayVerify = p["payments.verify_slip"];
  const canPayVoid = p["payments.void"];
  const canPayRefund = p["payments.refund"];
  const canFolioAdd = p["folio.add_charge"];
  const canFolioVoid = p["folio.void_charge"];
  const canChangeDate = p["bookings.change_date"];
  const canMoveRoom = p["bookings.move_room"];

  // room_types ดึงขนานไปเลย (ทั้งโรงแรม แล้วค่อยกรองตามสาขาของ booking ทีหลัง)
  // — เดิมรอ booking เสร็จก่อนค่อยยิง = เสีย 1 round trip ต่อคิว
  const [{ data: bookingData }, { data: folioData }, { data: balData }, { data: rtData }] =
    await Promise.all([
    supabase
      .from("bookings")
      .select(
        `id, code, status, check_in, check_out, checked_in_at, checked_out_at,
         adults, children, channel, created_at, total_satang, cancel_reason,
         guest:guests(id, full_name, phone, email),
         booking_rooms(id, nights, price_per_night_satang, room_type_id,
           room:rooms(room_number),
           room_type:room_types(name),
           rate_plan:rate_plans(name)),
         property:properties(id, name, tax_inclusive)`,
      )
      .eq("id", id)
      .eq("hotel_id", hotel.id)
      .maybeSingle(),
    supabase
      .from("folios")
      .select(
        "id, folio_items(id, category, description, qty, unit_price_satang, amount_satang, vat_satang, service_charge_satang, voided_at, void_reason, created_at)",
      )
      .eq("booking_id", id)
      .maybeSingle(),
    supabase
      .from("booking_balances")
      .select("folio_charges_satang, paid_satang, balance_satang")
      .eq("booking_id", id)
      .maybeSingle(),
    supabase
      .from("room_types")
      .select("id, name, property_id")
      .eq("hotel_id", hotel.id)
      .is("deleted_at", null)
      .order("sort_order"),
  ]);

  if (!bookingData) notFound();
  const b = bookingData;
  const guest = b.guest as { id: string; full_name: string; phone: string | null; email: string | null } | null;
  const property = b.property as { id: string; name: string; tax_inclusive: boolean };
  const rooms = (b.booking_rooms ?? []) as {
    id: string;
    nights: number;
    price_per_night_satang: number;
    room_type_id: string;
    room: { room_number: string } | null;
    room_type: { name: string } | null;
    rate_plan: { name: string } | null;
  }[];

  // ประเภทห้องของสาขานี้ — ตัวเลือกตอนย้ายห้อง (กรองจากชุดที่ดึงขนานไว้แล้ว)
  const roomTypes = ((rtData ?? []) as { id: string; name: string; property_id: string }[])
    .filter((rt) => rt.property_id === property.id)
    .map(({ id: rtId, name }) => ({ id: rtId, name }));
  const items = ((folioData?.folio_items ?? []) as FolioItemRow[]).sort((a, z) =>
    a.created_at.localeCompare(z.created_at),
  );
  const charges = balData?.folio_charges_satang ?? b.total_satang;
  const paid = balData?.paid_satang ?? 0;
  const balance = balData?.balance_satang ?? charges;

  const nights = rooms[0]?.nights ?? 1;
  const bookingOpen = ["pending", "confirmed", "checked_in"].includes(b.status);

  const info: { label: string; value: React.ReactNode }[] = [
    {
      label: "เข้าพัก",
      value: `${thDate(b.check_in)} → ${thDate(b.check_out)} (${nights} คืน)`,
    },
    // เวลากดเช็คอิน/เอาท์จริง — ต่างจากวันที่จองได้ (แขกมาช้า/ออกก่อน)
    ...(b.checked_in_at
      ? [{ label: "เช็คอินเมื่อ", value: thDateTime(b.checked_in_at) }]
      : []),
    ...(b.checked_out_at
      ? [{ label: "เช็คเอาท์เมื่อ", value: thDateTime(b.checked_out_at) }]
      : []),
    {
      label: "ห้อง",
      value: (
        <span className="flex flex-wrap items-center gap-1.5">
          {rooms[0]?.room_type?.name ?? "-"}
          <RoomBadge
            rooms={rooms.map((r) => r.room?.room_number).filter((n): n is string => !!n)}
          />
        </span>
      ),
    },
    { label: "ผู้เข้าพัก", value: `ผู้ใหญ่ ${b.adults}${b.children ? ` · เด็ก ${b.children}` : ""}` },
    ...(rooms[0]?.rate_plan?.name ? [{ label: "แพ็กเกจราคา", value: rooms[0].rate_plan.name }] : []),
    { label: "ช่องทางจอง", value: CHANNEL_TH[b.channel] ?? b.channel },
    ...(hotel.multi_property ? [{ label: "สาขา", value: property.name }] : []),
    {
      label: "จองเมื่อ",
      value: new Date(b.created_at).toLocaleDateString("th-TH", {
        day: "numeric",
        month: "short",
        year: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }),
    },
    ...(b.status === "cancelled" && b.cancel_reason
      ? [{ label: "เหตุผลที่ยกเลิก", value: b.cancel_reason }]
      : []),
  ];

  return (
    <AppPage
      back={{ href: hotelHref("/bookings", hotel.slug), label: "การจอง" }}
      title={
        <span className="flex items-center gap-3">
          <span className="font-mono">{b.code}</span>
          <Badge tone={BOOKING_STATUS_TONE[b.status] ?? "neutral"}>
            {STATUS_TH[b.status] ?? b.status}
          </Badge>
        </span>
      }
      subtitle={guest?.full_name ?? "ไม่ระบุชื่อ"}
      action={
        <div className="flex flex-wrap items-center gap-2">
          <EditBookingButtons
            hotelSlug={hotel.slug}
            bookingId={b.id}
            status={b.status}
            checkIn={b.check_in}
            checkOut={b.check_out}
            roomTypeId={rooms[0]?.room_type_id ?? null}
            roomTypes={roomTypes}
            canChangeDate={canChangeDate}
            canMoveRoom={canMoveRoom}
          />
          <DetailActions
            hotelSlug={hotel.slug}
            bookingId={b.id}
            code={b.code}
            status={b.status}
            checkIn={b.check_in}
            guestName={guest?.full_name ?? null}
            perms={{
              edit: canEdit,
              cancel: canCancel,
              checkin: canCheckin,
              checkout: canCheckout,
              payView: canPayView,
              charge: canPayCharge,
              verify: canPayVerify,
              voidPay: canPayVoid,
              refund: canPayRefund,
            }}
          />
        </div>
      }
    >
      <div className="grid gap-4 lg:grid-cols-2">
        {/* การเข้าพัก */}
        <Card>
          <h2 className="mb-3 text-lg font-semibold text-fg">การเข้าพัก</h2>
          <dl className="space-y-2">
            {info.map((r) => (
              <div key={r.label} className="flex gap-3">
                <dt className="w-28 shrink-0 text-base text-fg-muted">{r.label}</dt>
                <dd className="min-w-0 text-base text-fg">{r.value}</dd>
              </div>
            ))}
          </dl>
        </Card>

        {/* แขก + สรุปยอด */}
        <div className="space-y-4">
          <Card>
            <h2 className="mb-3 text-lg font-semibold text-fg">แขก</h2>
            {guest ? (
              <div className="space-y-1 text-base text-fg">
                <div>
                  <Link
                    href={hotelHref(`/guests/${guest.id}`, hotel.slug)}
                    className="font-medium text-info-strong underline-offset-2 hover:underline"
                  >
                    {guest.full_name}
                  </Link>
                </div>
                {guest.phone && <div className="text-fg-muted">{guest.phone}</div>}
                {guest.email && <div className="text-fg-muted">{guest.email}</div>}
              </div>
            ) : (
              <p className="text-base text-fg-muted">ไม่มีข้อมูลแขก</p>
            )}
          </Card>

          <Card>
            <h2 className="mb-3 text-lg font-semibold text-fg">สรุปยอด</h2>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-sm text-fg-muted">ยอดรวม</div>
                <div className="text-lg font-semibold tabular-nums text-fg">{baht(charges)}฿</div>
              </div>
              <div>
                <div className="text-sm text-fg-muted">ชำระแล้ว</div>
                <div className="text-lg font-semibold tabular-nums text-success-strong">
                  {baht(paid)}฿
                </div>
              </div>
              <div>
                <div className="text-sm text-fg-muted">{balance >= 0 ? "ค้างชำระ" : "ชำระเกิน"}</div>
                <div
                  className={`text-lg font-semibold tabular-nums ${
                    balance > 0 ? "text-danger-strong" : "text-success-strong"
                  }`}
                >
                  {baht(Math.abs(balance))}฿
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Folio เต็มแถว */}
        <Card className="lg:col-span-2">
          <FolioSection
            hotelSlug={hotel.slug}
            bookingId={b.id}
            items={items}
            taxInclusive={property.tax_inclusive}
            bookingOpen={bookingOpen}
            canAdd={canFolioAdd}
            canVoid={canFolioVoid}
          />
        </Card>
      </div>
    </AppPage>
  );
}
