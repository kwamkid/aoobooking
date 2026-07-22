import type { Database } from "@/types/database";
import type { FilterTabTone } from "@/components/ui";
import { requireHotelMember } from "@/lib/auth";
import { resolveAccess } from "@/lib/package/resolve-access";
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
import { AddTenancyButton, type RentableRoom } from "./forms";
import { TenantsTable } from "./tenants-table";

/* โมดูลเสริม "ผู้เช่ารายเดือน" (ตามแพ็กเกจ — rules: เช็ค 3 ชั้น)
 * ชั้นหน้า: ไม่มีโมดูล → upsell · ชั้นเมนู: app-shell ซ่อน · ชั้น DB: RPC เช็คเอง
 * list ผ่าน RPC search_tenancies (rules #20: pagination + lazy load) */

type TStatus = Database["public"]["Enums"]["tenancy_status"];
type Row = Database["public"]["Functions"]["search_tenancies"]["Returns"][number];

const PAGE_SIZE = 20;

const FILTERS: { id: string; name: string; statuses?: TStatus[]; tone: FilterTabTone; always?: boolean }[] = [
  { id: "active", name: "กำลังเช่า", statuses: ["active"], tone: "success", always: true },
  { id: "ended", name: "ย้ายออกแล้ว", statuses: ["ended"], tone: "neutral" },
  { id: "all", name: "ทั้งหมด", tone: "neutral", always: true },
];

export default async function TenantsPage({
  params,
  searchParams,
}: {
  params: Promise<{ hotel: string }>;
  searchParams: Promise<{ s?: string; q?: string; page?: string }>;
}) {
  const { hotel: hotelSlug } = await params;
  const sp = await searchParams;
  const { hotel } = await requireHotelMember(hotelSlug);
  const access = await resolveAccess(hotel.id);

  // ── โมดูลไม่เปิดตามแพ็กเกจ → upsell (เมนูปกติซ่อนอยู่แล้ว — กันเข้าตรงด้วย URL) ──
  if (!access.allowMonthlyRental) {
    return (
      <AppPage title="ผู้เช่ารายเดือน" subtitle={hotel.name}>
        <EmptyState
          art="guest"
          title="โมดูลเสริม — เช่ารายเดือน"
          description={`แพ็กเกจ ${access.packageName ?? "ปัจจุบัน"} ยังไม่มีโมดูลนี้ · ปล่อยเช่าห้องรายเดือน จัดการสัญญา และกันห้องจากการขายรายวันอัตโนมัติ`}
          action={
            <ButtonLink href={hotelHref("/settings/package", hotel.slug)}>
              ดูแพ็กเกจ
            </ButtonLink>
          }
        />
      </AppPage>
    );
  }

  const supabase = await createClient();
  const filter = FILTERS.find((f) => f.id === sp.s) ?? FILTERS[0];
  const page = Math.max(Number(sp.page) || 1, 1);
  const q = sp.q?.trim() || undefined;

  const [{ data: rowsData }, { data: statusRows }, { data: roomsData }, { data: propData }] =
    await Promise.all([
      supabase.rpc("search_tenancies", {
        p_hotel_id: hotel.id,
        p_statuses: filter.statuses,
        p_q: q,
        p_limit: PAGE_SIZE,
        p_offset: (page - 1) * PAGE_SIZE,
      }),
      supabase.from("tenancies").select("status").eq("hotel_id", hotel.id).limit(5000),
      // ห้องที่ปล่อยเช่าได้: ประเภทเปิดรายเดือน + ยังไม่มีผู้เช่า active
      supabase
        .from("rooms")
        .select("id, room_number, room_types!inner(name, monthly_rent_satang)")
        .eq("hotel_id", hotel.id)
        .is("deleted_at", null)
        .not("room_types.monthly_rent_satang", "is", null)
        .order("room_number"),
      supabase
        .from("properties")
        .select("monthly_deposit_months")
        .eq("hotel_id", hotel.id)
        .order("created_at")
        .limit(1)
        .maybeSingle(),
    ]);

  const rows = (rowsData ?? []) as Row[];
  const total = Number(rows[0]?.total_count ?? 0);
  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  const statusCount = new Map<string, number>();
  for (const r of statusRows ?? []) {
    statusCount.set(r.status as string, (statusCount.get(r.status as string) ?? 0) + 1);
  }
  const countOf = (f: (typeof FILTERS)[number]) =>
    f.statuses
      ? f.statuses.reduce((sum, st) => sum + (statusCount.get(st) ?? 0), 0)
      : [...statusCount.values()].reduce((a, b) => a + b, 0);

  // ตัดห้องที่มีผู้เช่า active ออกจากตัวเลือก
  const { data: activeRooms } = await supabase
    .from("tenancies")
    .select("room_id")
    .eq("hotel_id", hotel.id)
    .eq("status", "active");
  const taken = new Set((activeRooms ?? []).map((r) => r.room_id as string));

  const rentable: RentableRoom[] = ((roomsData ?? []) as unknown as {
    id: string;
    room_number: string;
    room_types: { name: string; monthly_rent_satang: number };
  }[])
    .filter((r) => !taken.has(r.id))
    .map((r) => ({
      id: r.id,
      label: `${r.room_number} · ${r.room_types.name}`,
      rentBaht: r.room_types.monthly_rent_satang / 100,
    }));

  const depositMonths =
    (propData as { monthly_deposit_months: number } | null)?.monthly_deposit_months ?? 1;

  const tabHref = (id: string) =>
    `${hotelHref("/tenants", hotel.slug)}?s=${id}${q ? `&q=${encodeURIComponent(q)}` : ""}`;

  return (
    <AppPage
      title="ผู้เช่ารายเดือน"
      subtitle={`${hotel.name} · ห้องที่มีผู้เช่าถูกกันออกจากการขายรายวันอัตโนมัติ`}
      action={
        <AddTenancyButton
          hotelSlug={hotel.slug}
          rooms={rentable}
          depositMonths={depositMonths}
        />
      }
      tabs={
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
      }
    >
      {rows.length === 0 ? (
        <EmptyState
          art="guest"
          title={filter.id === "active" ? "ยังไม่มีผู้เช่า" : `ไม่มีรายการ${filter.name}`}
          description={
            filter.id === "active"
              ? rentable.length > 0
                ? "กด “เพิ่มผู้เช่า” เพื่อสร้างสัญญาแรก"
                : "ตั้ง “ราคาเช่ารายเดือน” ที่ประเภทห้อง (หน้าห้องพัก > แก้ไข) ก่อน แล้วค่อยเพิ่มผู้เช่า"
              : undefined
          }
        />
      ) : (
        <div className="space-y-4">
          <Card pad={false}>
            <TenantsTable rows={rows} hotelSlug={hotel.slug} />
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
