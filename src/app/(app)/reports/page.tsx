import { requireHotelMember } from "@/lib/auth";
import { can } from "@/lib/permission";
import { createClient } from "@/lib/supabase/server";

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
  searchParams,
}: {
  searchParams: Promise<{ h?: string; from?: string; to?: string; p?: string }>;
}) {
  const { h, from, to, p } = await searchParams;
  const { hotel } = await requireHotelMember(h);
  const canView = await can(hotel.id, "reports.view");

  if (!canView) {
    return (
      <div className="mx-auto max-w-4xl p-8">
        <h1 className="text-2xl font-bold">รายงาน</h1>
        <p className="mt-4 text-neutral-500">คุณไม่มีสิทธิ์ดูรายงาน</p>
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
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="text-2xl font-bold">รายงาน</h1>

      <form className="mt-4 flex flex-wrap items-end gap-3 text-sm">
        <input type="hidden" name="h" value={hotel.slug} />
        <label className="flex flex-col gap-1">
          <span className="text-xs text-neutral-500">ตั้งแต่</span>
          <input
            type="date"
            name="from"
            defaultValue={defFrom}
            className="rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-neutral-500">ถึง</span>
          <input
            type="date"
            name="to"
            defaultValue={defTo}
            className="rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>
        {properties.length > 1 && (
          <label className="flex flex-col gap-1">
            <span className="text-xs text-neutral-500">สาขา</span>
            <select
              name="p"
              defaultValue={p ?? ""}
              className="rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
            >
              <option value="">ทุกสาขา</option>
              {properties.map((pr) => (
                <option key={pr.id} value={pr.id}>
                  {pr.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <button className="rounded-md bg-neutral-900 px-4 py-2 font-medium text-white dark:bg-white dark:text-neutral-900">
          ดูรายงาน
        </button>
      </form>

      {/* สรุปยอด */}
      <div className="mt-6 grid grid-cols-3 gap-3">
        <Stat label="รายได้ (charge folio)" value={baht(revenueTotal)} />
        <Stat label="รับเงินจริง (confirmed)" value={baht(paidTotal)} />
        <Stat label="คืนเงิน (refund)" value={baht(refundTotal)} tone="red" />
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

      <p className="mt-6 text-xs text-neutral-400">
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
  tone?: "red";
}) {
  return (
    <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="text-xs text-neutral-500">{label}</div>
      <div
        className={`mt-1 text-xl font-bold ${tone === "red" ? "text-red-600" : ""}`}
      >
        {value}฿
      </div>
    </div>
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
      <h2 className="mb-2 text-lg font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-neutral-400">{empty}</p>
      ) : (
        <table className="w-full max-w-md text-sm">
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k} className="border-b border-neutral-100 dark:border-neutral-900">
                <td className="py-1.5">{k}</td>
                <td className="py-1.5 text-right font-medium">{v}฿</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
