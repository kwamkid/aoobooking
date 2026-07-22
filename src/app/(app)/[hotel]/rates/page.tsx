import Link from "next/link";
import { requireHotelMember } from "@/lib/auth";
import { can } from "@/lib/permission";
import { hotelHref } from "@/lib/hotel/href";
import { createClient } from "@/lib/supabase/server";
import {
  AppPage,
  PropertyTabs,
  Card,
  EmptyState,
  Badge,
  DeleteButton,
  HintIcon,
} from "@/components/ui";
import { BasePriceModalButton, AddPriceButton } from "./forms";
import { deletePriceRange } from "./actions";

/* ============================================================================
 * หน้าตั้งราคา — โมเดล "ราคาปกติ + ช่วงราคาพิเศษ" (เจ้าของเสนอ 2026-07-16)
 * - ราคาปกติ (rate_base_prices): ยืนพื้นทุกคืน ตั้งครั้งเดียว ไม่มีวันหมดอายุ
 * - ช่วงราคาพิเศษ (rate_prices รายวัน): override ทับเฉพาะช่วง เช่น high season
 * - เพิ่มราคา = ปุ่มเดียว เลือกประเภทตอนกด (season / แพ็กเกจราคา) — เจ้าของขอ
 * - แพ็กเกจราคา (rate plan) ซ่อนจนกว่าจะมี >1 — "ราคาปกติ" สร้างให้อัตโนมัติ
 * ========================================================================== */

type Prop = { id: string; name: string };
type RoomType = { id: string; name: string };
type RatePlan = {
  id: string;
  name: string;
  include_breakfast: boolean;
  deposit_policy: { type: string; value?: number };
  cancellation_policy: { type: string; days_before?: number };
};
type PriceRow = {
  room_type_id: string;
  rate_plan_id: string;
  date: string;
  price_satang: number;
  min_stay: number;
  closed: boolean;
};
type BaseRow = { room_type_id: string; rate_plan_id: string; price_satang: number };

// ยุบวันติดกันที่ (ราคา, ขั้นต่ำ, ปิดขาย) เท่ากัน ให้เป็นช่วงเดียว
type Range = {
  from: string;
  to: string;
  price_satang: number;
  min_stay: number;
  closed: boolean;
};
function compressRanges(rows: PriceRow[]): Range[] {
  const out: Range[] = [];
  for (const r of rows) {
    const last = out[out.length - 1];
    if (
      last &&
      last.price_satang === r.price_satang &&
      last.min_stay === r.min_stay &&
      last.closed === r.closed &&
      nextDay(last.to) === r.date
    ) {
      last.to = r.date;
    } else {
      out.push({
        from: r.date,
        to: r.date,
        price_satang: r.price_satang,
        min_stay: r.min_stay,
        closed: r.closed,
      });
    }
  }
  return out;
}
function nextDay(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
function thDate(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
}
function baht(satang: number): string {
  return (satang / 100).toLocaleString("th-TH");
}

export default async function RatesPage({
  params,
  searchParams,
}: {
  params: Promise<{ hotel: string }>;
  searchParams: Promise<{ p?: string }>;
}) {
  const { hotel: hotelSlug } = await params;
  const { p } = await searchParams;
  const { hotel } = await requireHotelMember(hotelSlug);
  const canEdit = await can(hotel.id, "rates.edit");
  const supabase = await createClient();

  const { data: propsData } = await supabase
    .from("properties")
    .select("id, name")
    .eq("hotel_id", hotel.id)
    .is("deleted_at", null)
    .order("created_at");
  const properties = (propsData ?? []) as unknown as Prop[];
  const activeProp = properties.find((x) => x.id === p) ?? properties[0];

  if (!activeProp) {
    return (
      <AppPage title="ตั้งราคาห้องพัก" subtitle={hotel.name}>
        <EmptyState art="receipt" title="กำลังเตรียมข้อมูลโรงแรม…" />
      </AppPage>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const [{ data: rtData }, { data: rpData }, { data: priceData }, { data: baseData }] =
    await Promise.all([
      supabase
        .from("room_types")
        .select("id, name")
        .eq("property_id", activeProp.id)
        .is("deleted_at", null)
        .order("sort_order"),
      supabase
        .from("rate_plans")
        .select("id, name, include_breakfast, deposit_policy, cancellation_policy")
        .eq("property_id", activeProp.id)
        .is("deleted_at", null)
        .order("sort_order"),
      // override ตั้งแต่วันนี้ไป (อดีตไม่ต้องโชว์)
      supabase
        .from("rate_prices")
        .select("room_type_id, rate_plan_id, date, price_satang, min_stay, closed")
        .eq("hotel_id", hotel.id)
        .gte("date", today)
        .order("date")
        .limit(10000),
      supabase
        .from("rate_base_prices")
        .select("room_type_id, rate_plan_id, price_satang")
        .eq("hotel_id", hotel.id),
    ]);
  const roomTypes = (rtData ?? []) as unknown as RoomType[];
  const ratePlans = (rpData ?? []) as unknown as RatePlan[];
  const prices = (priceData ?? []) as unknown as PriceRow[];
  const basePrices = (baseData ?? []) as unknown as BaseRow[];

  const multiPlan = ratePlans.length > 1;

  if (roomTypes.length === 0) {
    return (
      <AppPage title="ตั้งราคาห้องพัก" subtitle={hotel.name}>
        <EmptyState
          art="receipt"
          title="ยังไม่มีประเภทห้อง"
          description={
            <>
              เพิ่มห้องพักก่อน แล้วค่อยกลับมาตั้งราคา{" "}
              <Link href={hotelHref("/rooms", hotel.slug)} className="text-brand underline">
                ไปเพิ่มห้อง
              </Link>
            </>
          }
        />
      </AppPage>
    );
  }

  return (
    <AppPage
      title="ตั้งราคาห้องพัก"
      subtitle={`${hotel.name} · ตั้งราคาปกติครั้งเดียวจบ — ช่วงเทศกาล/high season ค่อยเพิ่มราคาพิเศษทับ`}
      action={
        canEdit ? (
          <AddPriceButton
            hotelSlug={hotel.slug}
            propertyId={activeProp.id}
            roomTypes={roomTypes.map((rt) => ({ id: rt.id, name: rt.name }))}
            ratePlans={ratePlans.map((pl) => ({ id: pl.id, name: pl.name }))}
            basePrices={basePrices.map((b) => ({
              room_type_id: b.room_type_id,
              rate_plan_id: b.rate_plan_id,
              baht: b.price_satang / 100,
            }))}
          />
        ) : null
      }
      tabs={
        <PropertyTabs
          show={hotel.multi_property}
          activeId={activeProp.id}
          items={properties.map((pr) => ({
            id: pr.id,
            name: pr.name,
            href: `${hotelHref("/rates", hotel.slug)}?p=${pr.id}`,
          }))}
        />
      }
    >
      {/* การ์ดต่อประเภทห้อง */}
      <div className="space-y-4">
        {roomTypes.map((rt) => (
          <Card key={rt.id}>
            <h2 className="text-lg font-semibold text-fg">{rt.name}</h2>

            <div className={multiPlan ? "mt-3 space-y-5" : "mt-3"}>
              {ratePlans.map((plan) => {
                const base = basePrices.find(
                  (b) => b.room_type_id === rt.id && b.rate_plan_id === plan.id,
                );
                const overrides = compressRanges(
                  prices.filter(
                    (x) => x.room_type_id === rt.id && x.rate_plan_id === plan.id,
                  ),
                );
                return (
                  <div key={plan.id}>
                    {multiPlan && (
                      <div className="mb-2 flex items-center gap-2">
                        <span className="text-base font-medium text-fg">{plan.name}</span>
                        {plan.include_breakfast && (
                          <Badge tone="success">รวมอาหารเช้า</Badge>
                        )}
                      </div>
                    )}

                    {/* ── ราคาปกติ — พระเอกของแถว ── */}
                    <div
                      className={`flex flex-wrap items-center justify-between gap-3 rounded-(--radius) border px-4 py-3 ${
                        base
                          ? "border-border bg-bg-subtle"
                          : "border-warning bg-warning-soft"
                      }`}
                    >
                      {base ? (
                        <span className="text-base text-fg-muted">
                          ราคาปกติ{" "}
                          <strong className="ml-1 text-xl font-semibold tabular-nums text-fg">
                            {baht(base.price_satang)}
                          </strong>
                          <span className="text-fg-muted">฿/คืน</span>
                          <span className="ml-2 text-sm text-fg-subtle">
                            ทุกคืน · ไม่มีวันหมดอายุ
                          </span>
                        </span>
                      ) : (
                        <span className="text-base font-medium text-warning-strong">
                          ยังไม่ตั้งราคาปกติ —{" "}
                          {overrides.length > 0
                            ? "จองได้เฉพาะวันที่อยู่ในช่วงราคาพิเศษ"
                            : "ห้องนี้ยังจองไม่ได้"}
                        </span>
                      )}
                      {canEdit && (
                        <BasePriceModalButton
                          hotelSlug={hotel.slug}
                          roomTypeId={rt.id}
                          roomTypeName={rt.name}
                          ratePlanId={plan.id}
                          currentBaht={base ? base.price_satang / 100 : null}
                        />
                      )}
                    </div>

                    {/* ── ช่วงราคาพิเศษ ── */}
                    {overrides.length > 0 && (
                      <ul className="mt-2 divide-y divide-border overflow-hidden rounded-(--radius) border border-border bg-bg-elevated">
                        {overrides.map((r) => (
                          <li
                            key={r.from}
                            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5"
                          >
                            <span className="text-base tabular-nums text-fg-muted">
                              {thDate(r.from)} – {thDate(r.to)}
                            </span>
                            <span className="flex items-center gap-3">
                              <span className="text-lg font-semibold tabular-nums text-fg">
                                {r.closed ? (
                                  <span className="text-base font-medium text-danger-strong">
                                    ปิดขาย
                                  </span>
                                ) : (
                                  <>
                                    {baht(r.price_satang)}
                                    <span className="ml-0.5 text-sm font-normal text-fg-muted">
                                      ฿/คืน
                                    </span>
                                    {r.min_stay > 1 && (
                                      <span className="ml-2 text-sm font-normal text-fg-subtle">
                                        ขั้นต่ำ {r.min_stay} คืน
                                      </span>
                                    )}
                                  </>
                                )}
                              </span>
                              {canEdit && (
                                <DeleteButton
                                  action={deletePriceRange}
                                  hiddenFields={{
                                    hotelSlug: hotel.slug,
                                    ratePlanId: plan.id,
                                    roomTypeId: rt.id,
                                    from: r.from,
                                    to: r.to,
                                  }}
                                  label="ลบ"
                                  confirmTitle={`ลบช่วงราคา ${thDate(r.from)} – ${thDate(r.to)}?`}
                                  confirmDescription="วันในช่วงนี้จะกลับไปใช้ราคาปกติ"
                                  successMessage="ลบช่วงราคาแล้ว"
                                />
                              )}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        ))}
      </div>

      {/* ── แพ็กเกจราคา — โชว์เฉพาะเมื่อขายหลายเงื่อนไข (เพิ่มผ่านปุ่ม "เพิ่มราคา") ── */}
      {multiPlan && (
        <div className="mt-8 border-t border-border pt-5">
          <h3 className="flex items-center text-base font-semibold text-fg">
            แพ็กเกจราคา
            <HintIcon>
              ขายห้องเดิมได้หลายเงื่อนไข ราคาแยกกัน — แขกเลือกตอนจองว่าเอาแบบไหน ·
              เพิ่มอีกได้จากปุ่ม &quot;เพิ่มราคา&quot; ด้านบน
            </HintIcon>
          </h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {ratePlans.map((plan) => (
              <span
                key={plan.id}
                className="rounded-(--radius) border border-border bg-bg-elevated px-3 py-1.5 text-sm text-fg"
              >
                <span className="font-medium">{plan.name}</span>
                <span className="ml-2 text-fg-muted">
                  มัดจำ: {depositLabel(plan.deposit_policy)} · ยกเลิก:{" "}
                  {cancelLabel(plan.cancellation_policy)}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}
    </AppPage>
  );
}

function depositLabel(d: { type: string; value?: number }) {
  switch (d.type) {
    case "full":
      return "เต็มจำนวน";
    case "percent":
      return `${d.value}%`;
    case "fixed":
      return `${d.value}฿`;
    case "first_night":
      return "คืนแรก";
    default:
      return "ไม่เก็บ";
  }
}
function cancelLabel(c: { type: string; days_before?: number }) {
  return c.type === "non_refundable" ? "ไม่คืนเงิน" : `ฟรีก่อน ${c.days_before} วัน`;
}
