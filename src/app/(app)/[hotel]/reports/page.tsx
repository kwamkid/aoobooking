import { requireHotelMember } from "@/lib/auth";
import { can } from "@/lib/permission";
import { createClient } from "@/lib/supabase/server";
import {
  PageHeader,
  Card,
  Field,
  Input,
  Select,
  Button,
  Table,
  TBody,
  TR,
  TD,
} from "@/components/ui";

type Prop = { id: string; name: string };

const CATEGORY_LABEL: Record<string, string> = {
  room: "ค่าห้อง",
  food: "อาหาร",
  minibar: "มินิบาร์",
  laundry: "ซักรีด",
  spa: "สปา",
  service_charge: "Service Charge",
  vat: "VAT",
  other: "อื่นๆ",
};
const METHOD_LABEL: Record<string, string> = {
  cash: "เงินสด",
  bank_transfer: "โอน",
  card_terminal: "รูดบัตร (EDC)",
  promptpay_qr: "PromptPay",
  card_online: "บัตรออนไลน์",
  wechat_pay: "WeChat",
  alipay: "Alipay",
  ota_collect: "OTA เก็บ",
  other: "อื่นๆ",
};

function baht(satang: number) {
  return (satang / 100).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

export default async function ReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ hotel: string }>;
  searchParams: Promise<{ from?: string; to?: string; p?: string }>;
}) {
  const { hotel: hotelSlug } = await params;
  const { from, to, p } = await searchParams;
  const { hotel } = await requireHotelMember(hotelSlug);
  const canView = await can(hotel.id, "reports.view");

  if (!canView) {
    return (
      <div className="p-4 sm:p-8">
        <PageHeader title="รายงาน" subtitle={hotel.name} />
        <p className="mt-4 text-fg-muted">คุณไม่มีสิทธิ์ดูรายงาน</p>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: propsData } = await supabase
    .from("properties")
    .select("id, name")
    .eq("hotel_id", hotel.id)
    .is("deleted_at", null)
    .order("created_at");
  const properties = (propsData ?? []) as Prop[];

  // default: เดือนปัจจุบัน
  const now = new Date();
  const defFrom = from ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
  const defTo = to ?? now.toISOString().slice(0, 10);

  // รายได้แยกหมวด (folio_items ที่ไม่ void, booking ในช่วง)
  // รายได้แยกช่องทาง (payments confirmed ในช่วง) — ยอด = amount_base_satang
  // filter สาขา (ถ้าเลือก) — folio_items/payments ไม่มี property_id ตรง → filter ผ่าน booking
  let bookingIds: string[] | null = null;
  if (p) {
    const { data: bks } = await supabase
      .from("bookings")
      .select("id")
      .eq("hotel_id", hotel.id)
      .eq("property_id", p);
    bookingIds = ((bks ?? []) as { id: string }[]).map((b) => b.id);
    if (bookingIds.length === 0) bookingIds = ["00000000-0000-0000-0000-000000000000"];
  }

  let itemsQuery = supabase
    .from("folio_items")
    .select("category, amount_satang, vat_satang, service_charge_satang, created_at, folio_id")
    .eq("hotel_id", hotel.id)
    .is("voided_at", null)
    .gte("created_at", defFrom)
    .lte("created_at", defTo + "T23:59:59");
  let paysQuery = supabase
    .from("payments")
    .select("direction, method, amount_base_satang, status, created_at, booking_id")
    .eq("hotel_id", hotel.id)
    .eq("status", "confirmed")
    .gte("created_at", defFrom)
    .lte("created_at", defTo + "T23:59:59");
  if (bookingIds) {
    paysQuery = paysQuery.in("booking_id", bookingIds);
    // folio_items ผูก booking ผ่าน folio → กรองด้วย folio ของ booking เหล่านั้น
    const { data: fol } = await supabase
      .from("folios")
      .select("id")
      .in("booking_id", bookingIds);
    const folioIds = ((fol ?? []) as { id: string }[]).map((f) => f.id);
    itemsQuery = itemsQuery.in(
      "folio_id",
      folioIds.length ? folioIds : ["00000000-0000-0000-0000-000000000000"],
    );
  }
  const [{ data: items }, { data: pays }] = await Promise.all([itemsQuery, paysQuery]);

  // aggregate รายได้แยกหมวด
  const byCategory = new Map<string, number>();
  let revenueTotal = 0;
  for (const it of (items ?? []) as { category: string; amount_satang: number }[]) {
    byCategory.set(it.category, (byCategory.get(it.category) ?? 0) + it.amount_satang);
    revenueTotal += it.amount_satang;
  }

  // aggregate ช่องทางชำระ + refund
  const byMethod = new Map<string, number>();
  let paidTotal = 0;
  let refundTotal = 0;
  for (const pay of (pays ?? []) as {
    direction: string;
    method: string;
    amount_base_satang: number;
  }[]) {
    if (pay.direction === "refund") {
      refundTotal += pay.amount_base_satang;
    } else {
      byMethod.set(pay.method, (byMethod.get(pay.method) ?? 0) + pay.amount_base_satang);
      paidTotal += pay.amount_base_satang;
    }
  }

  return (
    <div className="p-4 sm:p-8">
      <PageHeader title="รายงาน" subtitle={hotel.name} />

      <form className="mb-6 flex flex-wrap items-end gap-3">
        <Field label="ตั้งแต่">
          <Input type="date" name="from" defaultValue={defFrom} />
        </Field>
        <Field label="ถึง">
          <Input type="date" name="to" defaultValue={defTo} />
        </Field>
        {properties.length > 1 && (
          <Field label="สาขา">
            <Select
              name="p"
              defaultValue={p ?? ""}
              options={[
                { value: "", label: "ทุกสาขา" },
                ...properties.map((pr) => ({ value: pr.id, label: pr.name })),
              ]}
            />
          </Field>
        )}
        <Button type="submit">ดูรายงาน</Button>
      </form>

      {/* สรุปยอด */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="รายได้ (charge folio)" value={baht(revenueTotal)} />
        <Stat label="รับเงินจริง (confirmed)" value={baht(paidTotal)} />
        <Stat label="คืนเงิน (refund)" value={baht(refundTotal)} tone="danger" />
      </div>

      {/* รายได้แยกหมวด */}
      <ReportTable
        title="รายได้แยกหมวด"
        rows={[...byCategory.entries()].map(([k, v]) => [
          CATEGORY_LABEL[k] ?? k,
          baht(v),
        ])}
        empty="ไม่มีรายการในช่วงนี้"
      />

      {/* รายได้แยกช่องทางชำระ */}
      <ReportTable
        title="รับเงินแยกช่องทาง"
        rows={[...byMethod.entries()].map(([k, v]) => [METHOD_LABEL[k] ?? k, baht(v)])}
        empty="ยังไม่มีการรับเงินในช่วงนี้"
      />

      <p className="mt-6 text-xs text-fg-subtle">
        ยอดรับเงิน/refund คิดจาก amount_base_satang (สกุลบัญชี) · ADR/RevPAR อยู่ใน night audit (Phase 2)
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "danger";
}) {
  return (
    <Card>
      <div className="text-xs text-fg-muted">{label}</div>
      <div className={`mt-1 text-xl font-bold ${tone === "danger" ? "text-danger" : "text-fg"}`}>
        {value}฿
      </div>
    </Card>
  );
}

function ReportTable({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: [string, string][];
  empty: string;
}) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-lg font-semibold text-fg">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-fg-subtle">{empty}</p>
      ) : (
        <Table className="max-w-md">
          <TBody>
            {rows.map(([k, v]) => (
              <TR key={k}>
                <TD>{k}</TD>
                <TD className="text-right font-medium">{v}฿</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </section>
  );
}
