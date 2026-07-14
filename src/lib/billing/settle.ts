import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// ⚠️ ห้ามย้ายไฟล์นี้เข้าไฟล์ "use server" — settleInvoicePaid ไม่มี auth check
// (ถูกเรียกจาก webhook/cron/action ที่เช็คสิทธิ์แล้วเท่านั้น) ถ้าเป็น server action
// จะกลายเป็น endpoint ที่ client ยิงได้ตรง = ใครก็ mark invoice ว่าจ่ายแล้วได้

type Cycle = "monthly" | "yearly";

function periodEnd(cycle: Cycle, from = new Date()): Date {
  const d = new Date(from);
  if (cycle === "yearly") d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d;
}

/** จุดเดียวที่ "invoice จ่ายแล้ว" → mark paid + ต่ออายุ subscription + apply package + log
 *  idempotent (webhook Beam อาจยิงซ้ำ) — ใช้ทั้ง dev mode / webhook */
export async function settleInvoicePaid(
  invoiceId: string,
  opts: { dev?: boolean; raw?: unknown } = {},
) {
  const admin = createAdminClient();

  const { data: invoice } = await admin
    .from("invoices")
    .select("*")
    .eq("id", invoiceId)
    .single();
  if (!invoice) throw new Error("invoice not found");
  if (invoice.status === "paid") return; // idempotent

  await admin
    .from("invoices")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      raw: opts.raw ?? (opts.dev ? { dev: true } : null),
      updated_at: new Date().toISOString(),
    })
    .eq("id", invoiceId);

  // ต่ออายุ/สร้าง subscription — รอบใหม่นับจากตอนนี้ (MVP ไม่ทำ proration)
  const end = periodEnd(invoice.billing_cycle as Cycle);
  await admin.from("subscriptions").upsert(
    {
      hotel_id: invoice.hotel_id,
      package_id: invoice.package_id,
      billing_cycle: invoice.billing_cycle,
      status: "active",
      current_period_end: end.toISOString(),
      grace_until: null,
      scheduled_package_id: null,
      scheduled_cycle: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "hotel_id" },
  );

  // เปลี่ยน package จริง (log 'package.changed' ในตัว)
  await admin.rpc("apply_package_change", {
    p_hotel_id: invoice.hotel_id,
    p_package_id: invoice.package_id,
    p_reason: opts.dev ? "upgrade_paid(dev)" : "upgrade_paid",
  });

  await admin.rpc("log_audit", {
    p_hotel_id: invoice.hotel_id,
    p_action: "invoice.paid",
    p_entity_type: "invoice",
    p_entity_id: invoiceId,
    p_new: { paid_at: new Date().toISOString(), dev: opts.dev ?? false },
  });
}
