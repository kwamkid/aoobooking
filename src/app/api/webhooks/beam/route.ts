import { NextResponse, type NextRequest } from "next/server";
import { verifyWebhookSignature } from "@/lib/billing/beam";
import { settleInvoicePaid } from "@/lib/billing/settle";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Beam webhook — จ่ายสำเร็จ → settle invoice (idempotent)
 * referenceId ที่ส่งให้ Beam = invoices.id
 *
 * ⚠️ TODO(Beam): implement verifyWebhookSignature ก่อนใช้จริง —
 * ตอนนี้ return false เสมอ = webhook ยังไม่รับของจริง (ปลอดภัยไว้ก่อน)
 */
export async function POST(request: NextRequest) {
  const payload = await request.text();
  const signature = request.headers.get("x-beam-signature");

  if (!verifyWebhookSignature(payload, signature)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const event = JSON.parse(payload);
  const invoiceId: string | undefined = event?.data?.referenceId;
  const chargeId: string | undefined = event?.data?.chargeId;

  if (event?.type === "charge.succeeded" && invoiceId) {
    // ผูก charge id ก่อน settle (debug ได้ว่า charge ไหน)
    const admin = createAdminClient();
    await admin
      .from("invoices")
      .update({ beam_charge_id: chargeId ?? null })
      .eq("id", invoiceId)
      .eq("status", "pending");

    await settleInvoicePaid(invoiceId, { raw: event });
  }

  if (event?.type === "charge.failed" && invoiceId) {
    const admin = createAdminClient();
    await admin
      .from("invoices")
      .update({ status: "failed", raw: event })
      .eq("id", invoiceId)
      .eq("status", "pending");
    await admin.rpc("log_audit", {
      p_hotel_id: null,
      p_action: "invoice.failed",
      p_entity_type: "invoice",
      p_entity_id: invoiceId,
      p_new: { charge_id: chargeId },
    });
  }

  return NextResponse.json({ ok: true });
}
