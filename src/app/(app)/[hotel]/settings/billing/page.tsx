import Link from "next/link";
import { requireHotelMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hotelHref } from "@/lib/hotel/href";
import {
  Card,
  Badge,
  EmptyState,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
  PageHeader,
} from "@/components/ui";

const STATUS_TH: Record<string, string> = {
  pending: "รอชำระ",
  paid: "ชำระแล้ว",
  failed: "ล้มเหลว",
  expired: "หมดอายุ",
  void: "ยกเลิก",
};

type Tone = "neutral" | "brand" | "success" | "warning" | "danger" | "info";
const STATUS_TONE: Record<string, Tone> = {
  pending: "warning",
  paid: "success",
  failed: "danger",
  expired: "neutral",
  void: "neutral",
};

export default async function BillingPage({
  params,
}: {
  params: Promise<{ hotel: string }>;
}) {
  const { hotel: hotelSlug } = await params;
  const { hotel } = await requireHotelMember(hotelSlug);
  const supabase = await createClient();

  const { data: invoices } = await supabase
    .from("invoices")
    .select("*, packages(name)")
    .eq("hotel_id", hotel.id)
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div className="p-4 sm:p-8">
      <PageHeader
        title="ประวัติการชำระเงิน"
        subtitle={
          <>
            {hotel.name} ·{" "}
            <Link
              href={hotelHref("/settings/package", hotel.slug)}
              className="text-brand underline"
            >
              จัดการแพ็กเกจ
            </Link>
          </>
        }
      />

      {!invoices || invoices.length === 0 ? (
        <EmptyState art="receipt" title="ยังไม่มีรายการ" />
      ) : (
        <Card pad={false}>
          <Table>
            <THead>
              <TR>
                <TH>วันที่</TH>
                <TH>แพ็กเกจ</TH>
                <TH className="text-right">ยอด (บาท)</TH>
                <TH>ช่องทาง</TH>
                <TH>สถานะ</TH>
              </TR>
            </THead>
            <TBody>
              {invoices.map((inv) => (
                <TR key={inv.id}>
                  <TD className="whitespace-nowrap text-fg-muted">
                    {new Date(inv.created_at).toLocaleDateString("th-TH")}
                  </TD>
                  <TD>
                    {(inv.packages as { name: string } | null)?.name ?? "-"} (
                    {inv.billing_cycle === "yearly" ? "รายปี" : "รายเดือน"})
                  </TD>
                  <TD className="text-right font-mono">
                    {(inv.amount_satang / 100).toLocaleString("th-TH", {
                      minimumFractionDigits: 2,
                    })}
                  </TD>
                  <TD className="text-fg-muted">{inv.payment_method}</TD>
                  <TD>
                    <Badge tone={STATUS_TONE[inv.status] ?? "neutral"}>
                      {STATUS_TH[inv.status] ?? inv.status}
                    </Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
