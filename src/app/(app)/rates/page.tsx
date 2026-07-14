import Link from "next/link";
import { requireHotelMember } from "@/lib/auth";
import { can } from "@/lib/permission";
import { hotelHref } from "@/lib/hotel/href";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { RatePlanForm, BulkPriceForm } from "./forms";

type Prop = { id: string; name: string };
type RoomType = { id: string; name: string };
type RatePlan = {
  id: string;
  name: string;
  include_breakfast: boolean;
  deposit_policy: { type: string; value?: number };
  cancellation_policy: { type: string; days_before?: number };
};

export default async function RatesPage({
  searchParams,
}: {
  searchParams: Promise<{ h?: string; p?: string }>;
}) {
  const { h, p } = await searchParams;
  const { hotel } = await requireHotelMember(h);
  const canEdit = await can(hotel.id, "rates.edit");
  const supabase = await createClient();

  const { data: propsData } = await supabase
    .from("properties")
    .select("id, name")
    .eq("hotel_id", hotel.id)
    .is("deleted_at", null)
    .order("created_at");
  const properties = (propsData ?? []) as unknown as Prop[];

  if (properties.length === 0) {
    return (
      <div className="mx-auto max-w-4xl p-4 sm:p-8">
        <PageHeader title="ราคา" subtitle={hotel.name} />
        <EmptyState
          art="receipt"
          title="ยังไม่มีสาขา"
          description={
            <>
              เพิ่มสาขาก่อนจึงจะตั้งราคาได้{" "}
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

  const [{ data: rtData }, { data: rpData }] = await Promise.all([
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
  ]);
  const roomTypes = (rtData ?? []) as unknown as RoomType[];
  const ratePlans = (rpData ?? []) as unknown as RatePlan[];

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-8">
      <PageHeader title="ราคา & แพ็กเกจราคา" subtitle={hotel.name} />

      <div className="flex flex-wrap gap-2">
        {properties.map((pr) => (
          <Link
            key={pr.id}
            href={`${hotelHref("/rates", hotel.slug)}&p=${pr.id}`}
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

      {roomTypes.length === 0 && (
        <p className="mt-6 text-sm text-fg-subtle">
          ยังไม่มีประเภทห้อง —{" "}
          <Link href={hotelHref("/rooms", hotel.slug)} className="text-brand underline">
            เพิ่มห้องก่อน
          </Link>
        </p>
      )}

      {/* rate plans */}
      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold text-fg">Rate Plans</h2>
        <div className="space-y-2">
          {ratePlans.map((rp) => (
            <Card key={rp.id} className="text-sm" pad={false}>
              <div className="p-3">
                <span className="font-medium text-fg">{rp.name}</span>
                {rp.include_breakfast && (
                  <span className="ml-2 text-xs text-success">รวมอาหารเช้า</span>
                )}
                <span className="ml-2 text-xs text-fg-muted">
                  มัดจำ: {depositLabel(rp.deposit_policy)} · ยกเลิก:{" "}
                  {cancelLabel(rp.cancellation_policy)}
                </span>
              </div>
            </Card>
          ))}
          {ratePlans.length === 0 && (
            <p className="text-sm text-fg-subtle">ยังไม่มี rate plan</p>
          )}
        </div>

        {canEdit && roomTypes.length > 0 && (
          <div className="mt-4">
            <RatePlanForm hotelSlug={hotel.slug} propertyId={activeProp.id} />
          </div>
        )}
      </section>

      {/* bulk price setter */}
      {canEdit && ratePlans.length > 0 && roomTypes.length > 0 && (
        <section className="mt-8 border-t border-border pt-6">
          <h2 className="mb-3 text-lg font-semibold text-fg">ตั้งราคาช่วงวัน (season)</h2>
          <BulkPriceForm
            hotelSlug={hotel.slug}
            ratePlans={ratePlans.map((r) => ({ id: r.id, name: r.name }))}
            roomTypes={roomTypes}
          />
        </section>
      )}
    </div>
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
  return c.type === "non_refundable"
    ? "ไม่คืนเงิน"
    : `ฟรีก่อน ${c.days_before} วัน`;
}
