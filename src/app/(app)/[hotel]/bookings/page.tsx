import type { Database } from "@/types/database";
import type { FilterTabTone } from "@/components/ui";
import { requireHotelMember } from "@/lib/auth";
import { canMany } from "@/lib/permission";
import { hotelHref } from "@/lib/hotel/href";
import { createClient } from "@/lib/supabase/server";
import {
  AppPage,
  FilterTabs,
  ButtonLink,
  Card,
  EmptyState,
  PaginationNav,
} from "@/components/ui";
import { BookingsFilterBar } from "./filter-bar";
import { BookingsTable } from "./bookings-table";

/* หน้าการจอง — ข้อมูลผ่าน RPC `search_bookings` ทั้งหมด (rules #20):
 * filter (สถานะ/ค้นหา/ช่วงวัน/ประเภทห้อง) + pagination ทำใน query เดียวที่ DB
 * ดึงมาทีละหน้า (lazy load) · total_count จาก window function ไม่ยิงนับซ้ำ */

type BookingStatus = Database["public"]["Enums"]["booking_status"];
type Row = Database["public"]["Functions"]["search_bookings"]["Returns"][number];

const PAGE_SIZE = 20;

const FILTERS: {
  id: string;
  name: string;
  statuses?: BookingStatus[];
  tone: FilterTabTone;
  always?: boolean;
}[] = [
  { id: "all", name: "ทั้งหมด", tone: "neutral", always: true },
  { id: "upcoming", name: "จะเข้าพัก", statuses: ["pending", "confirmed"], tone: "info" },
  { id: "inhouse", name: "พักอยู่ตอนนี้", statuses: ["checked_in"], tone: "success" },
  { id: "done", name: "เสร็จสิ้น", statuses: ["checked_out"], tone: "neutral" },
  { id: "cancelled", name: "ยกเลิก/ไม่มา", statuses: ["cancelled", "no_show"], tone: "danger" },
];


export default async function BookingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ hotel: string }>;
  searchParams: Promise<{
    s?: string;
    q?: string;
    from?: string;
    to?: string;
    rt?: string;
    page?: string;
  }>;
}) {
  const { hotel: hotelSlug } = await params;
  const sp = await searchParams;
  const { hotel } = await requireHotelMember(hotelSlug);
  const [
    canCreate,
    canEdit,
    canCancel,
    canCheckin,
    canCheckout,
    canPayView,
    canPayCharge,
    canPayVerify,
    canPayVoid,
    canPayRefund,
  ] = await (async () => {
    // สิทธิ์ทั้งหน้าในรอบเดียว (เดิม 10 RPC call — ลดโหลดต่อหน้า 2026-07-24)
    const p = await canMany(hotel.id, [
      "bookings.create",
      "bookings.edit",
      "bookings.cancel",
      "bookings.checkin",
      "bookings.checkout",
      "payments.view",
      "payments.charge",
      "payments.verify_slip",
      "payments.void",
      "payments.refund",
    ] as const);
    return [
      p["bookings.create"],
      p["bookings.edit"],
      p["bookings.cancel"],
      p["bookings.checkin"],
      p["bookings.checkout"],
      p["payments.view"],
      p["payments.charge"],
      p["payments.verify_slip"],
      p["payments.void"],
      p["payments.refund"],
    ] as const;
  })();
  const supabase = await createClient();

  const filter = FILTERS.find((f) => f.id === sp.s) ?? FILTERS[0];
  const page = Math.max(Number(sp.page) || 1, 1);
  const q = sp.q?.trim() || undefined;
  const from = sp.from || undefined;
  const to = sp.to || undefined;
  const rt = sp.rt || undefined;

  const [{ data: rowsData }, { data: countData }, { data: rtData }] =
    await Promise.all([
      supabase.rpc("search_bookings", {
        p_hotel_id: hotel.id,
        p_statuses: filter.statuses,
        p_q: q,
        p_from: from,
        p_to: to,
        p_room_type_id: rt,
        p_limit: PAGE_SIZE,
        p_offset: (page - 1) * PAGE_SIZE,
      }),
      supabase.rpc("booking_status_counts", { p_hotel_id: hotel.id }),
      supabase
        .from("room_types")
        .select("id, name")
        .eq("hotel_id", hotel.id)
        .is("deleted_at", null)
        .order("sort_order"),
    ]);

  const rows = (rowsData ?? []) as Row[];
  const total = Number(rows[0]?.total_count ?? 0);
  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);
  const roomTypes = (rtData ?? []) as { id: string; name: string }[];

  const statusCount = new Map(
    (countData ?? []).map((r) => [r.status as string, Number(r.cnt)]),
  );
  const countOf = (f: (typeof FILTERS)[number]) =>
    f.statuses
      ? f.statuses.reduce((sum, st) => sum + (statusCount.get(st) ?? 0), 0)
      : [...statusCount.values()].reduce((a, b) => a + b, 0);

  // สลับ tab เก็บ filter อื่นไว้ · ไม่ใส่ page = รีเซ็ตหน้า 1
  const keep = new URLSearchParams();
  if (q) keep.set("q", q);
  if (from) keep.set("from", from);
  if (to) keep.set("to", to);
  if (rt) keep.set("rt", rt);
  const tabHref = (id: string) => {
    const p = new URLSearchParams(keep);
    p.set("s", id);
    return `${hotelHref("/bookings", hotel.slug)}?${p.toString()}`;
  };

  const today = new Date().toISOString().slice(0, 10);
  const hasFilter = !!(q || from || to || rt);

  return (
    <AppPage
      title="การจอง"
      subtitle={hotel.name}
      action={
        canCreate && (
          <ButtonLink href={hotelHref("/bookings/new", hotel.slug)}>+ จองใหม่</ButtonLink>
        )
      }
      tabs={
        <div className="space-y-3">
          <FilterTabs
            activeId={filter.id}
            tabs={FILTERS.map((f) => ({
              id: f.id,
              label: f.name,
              count: countOf(f),
              href: tabHref(f.id),
              tone: f.tone,
              always: f.always,
            }))}
          />
          <BookingsFilterBar
            s={filter.id}
            q={q}
            from={from}
            to={to}
            rt={rt}
            roomTypes={roomTypes}
            clearHref={`${hotelHref("/bookings", hotel.slug)}?s=${filter.id}`}
          />
        </div>
      }
    >
      {rows.length === 0 ? (
        <EmptyState
          art="calendar"
          title={
            hasFilter
              ? "ไม่พบการจองตามเงื่อนไข"
              : filter.id === "all"
                ? "ยังไม่มีการจอง"
                : `ไม่มีรายการ${filter.name}`
          }
          description={
            hasFilter
              ? "ลองปรับช่วงวันที่ หรือล้างตัวกรองดู"
              : filter.id === "all"
                ? "เริ่มรับจองจากหน้าเคาน์เตอร์ได้เลย"
                : undefined
          }
          action={
            !hasFilter && filter.id === "all" && canCreate ? (
              <ButtonLink href={hotelHref("/bookings/new", hotel.slug)}>+ จองใหม่</ButtonLink>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-4">
          <Card pad={false}>
            <BookingsTable
              rows={rows}
              hotelSlug={hotel.slug}
              today={today}
              perms={{
                edit: canEdit,
                cancel: canCancel,
                checkin: canCheckin,
                checkout: canCheckout,
                payView: canPayView,
                payCharge: canPayCharge,
                payVerify: canPayVerify,
                payVoid: canPayVoid,
                payRefund: canPayRefund,
              }}
            />
          </Card>

          <PaginationNav
            currentPage={page}
            totalPages={totalPages}
            totalItems={total}
            pageSize={PAGE_SIZE}
          />
        </div>
      )}
    </AppPage>
  );
}
