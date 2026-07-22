import { requireHotelMember } from "@/lib/auth";
import { can } from "@/lib/permission";
import { createClient } from "@/lib/supabase/server";
import { AppPage, Card } from "@/components/ui";
import type { Database } from "@/types/database";
import type { PaymentAccount } from "@/lib/payment/types";
import { MethodList } from "./methods-grid";

/* ตั้งค่า > ช่องทางชำระเงิน — prefill ครบทุกช่องทาง (seed ตอนสร้างโรงแรม)
 * เปิด/ปิดตามที่รับจริง + ตั้งบัญชีรับเงิน (PromptPay QR / ธนาคารหลายบัญชี /
 * เครื่องรูดหลายเครื่อง) — ไปโผล่ตอนบันทึกรับเงินใน payment modal */

type PaymentMethod = Database["public"]["Enums"]["payment_method"];

export default async function PaymentMethodsSettingsPage({
  params,
}: {
  params: Promise<{ hotel: string }>;
}) {
  const { hotel: hotelSlug } = await params;
  const { hotel } = await requireHotelMember(hotelSlug);
  const canEdit = await can(hotel.id, "settings.properties");

  const supabase = await createClient();
  const [{ data }, { data: accountData }] = await Promise.all([
    supabase
      .from("hotel_payment_methods")
      .select("method, active")
      .eq("hotel_id", hotel.id)
      .order("sort_order"),
    supabase
      .from("hotel_payment_accounts")
      .select("id, method, name, details, active")
      .eq("hotel_id", hotel.id)
      .order("sort_order"),
  ]);
  const methods = (data ?? []) as { method: PaymentMethod; active: boolean }[];
  const accounts = (accountData ?? []) as PaymentAccount[];

  return (
    <AppPage
      title="ช่องทางชำระเงิน"
      subtitle="เลือกช่องทางที่โรงแรมรับจริง — ช่องทางที่ปิดจะไม่ขึ้นตอนบันทึกรับเงิน"
    >
      <Card>
        <MethodList
          hotelSlug={hotel.slug}
          methods={methods}
          accounts={accounts}
          canEdit={canEdit}
        />
        {!canEdit && (
          <p className="mt-3 text-sm text-fg-subtle">
            คุณไม่มีสิทธิ์แก้ไข (settings.properties) — ดูได้อย่างเดียว
          </p>
        )}
      </Card>
    </AppPage>
  );
}
