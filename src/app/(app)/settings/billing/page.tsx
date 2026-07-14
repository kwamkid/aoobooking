import Link from "next/link";
import { requireHotelMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hotelHref } from "@/lib/hotel/href";

const STATUS_TH: Record<string, string> = {
  pending: "รอชำระ",
  paid: "ชำระแล้ว",
  failed: "ล้มเหลว",
  expired: "หมดอายุ",
  void: "ยกเลิก",
};

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ h?: string }>;
}) {
  const { h } = await searchParams;
  const { hotel } = await requireHotelMember(h);
  const supabase = await createClient();

  const { data: invoices } = await supabase
    .from("invoices")
    .select("*, packages(name)")
    .eq("hotel_id", hotel.id)
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-bold">ประวัติการชำระเงิน</h1>
      <p className="mt-1 text-neutral-500">
        {hotel.name} ·{" "}
        <Link href={hotelHref("/settings/package", hotel.slug)} className="underline">
          จัดการแพ็กเกจ
        </Link>
      </p>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-neutral-500 dark:border-neutral-800">
              <th className="py-2 pr-4">วันที่</th>
              <th className="py-2 pr-4">แพ็กเกจ</th>
              <th className="py-2 pr-4 text-right">ยอด (บาท)</th>
              <th className="py-2 pr-4">ช่องทาง</th>
              <th className="py-2">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {(invoices ?? []).map((inv) => (
              <tr
                key={inv.id}
                className="border-b border-neutral-100 dark:border-neutral-900"
              >
                <td className="py-2 pr-4">
                  {new Date(inv.created_at).toLocaleDateString("th-TH")}
                </td>
                <td className="py-2 pr-4">
                  {(inv.packages as { name: string } | null)?.name ?? "-"} (
                  {inv.billing_cycle === "yearly" ? "รายปี" : "รายเดือน"})
                </td>
                <td className="py-2 pr-4 text-right font-mono">
                  {(inv.amount_satang / 100).toLocaleString("th-TH", {
                    minimumFractionDigits: 2,
                  })}
                </td>
                <td className="py-2 pr-4">{inv.payment_method}</td>
                <td className="py-2">{STATUS_TH[inv.status] ?? inv.status}</td>
              </tr>
            ))}
            {(!invoices || invoices.length === 0) && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-neutral-400">
                  ยังไม่มีรายการ
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
