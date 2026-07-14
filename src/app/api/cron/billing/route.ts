import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Cron billing (รันรายวัน หรือถี่กว่า) — ทุก transition ลง audit log:
 * 1) active + หมดรอบ + มีนัดดาวน์เกรด → apply แพ็กใหม่ทันที
 *    (แพ็กฟรี → ปิด subscription · แพ็กเสียเงิน → เข้า grace รอจ่ายแพ็กใหม่)
 * 2) active + หมดรอบ (ไม่มีนัด) → เข้า grace (GRACE_DAYS วัน)
 * 3) grace + เกิน grace_until → downgrade เป็น Free + expired
 *
 * ป้องกันด้วย CRON_SECRET (?secret= หรือ Authorization: Bearer)
 */
const GRACE_DAYS = 7;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const given =
    request.nextUrl.searchParams.get("secret") ??
    request.headers.get("authorization")?.replace("Bearer ", "");
  if (!secret || given !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();
  const results = { scheduled_applied: 0, entered_grace: 0, downgraded: 0 };

  const { data: freePkg } = await admin
    .from("packages")
    .select("id")
    .eq("slug", "free")
    .single();

  // ── 1+2) active ที่หมดรอบ ──
  const { data: dueSubs } = await admin
    .from("subscriptions")
    .select("*")
    .eq("status", "active")
    .lt("current_period_end", now);

  for (const sub of dueSubs ?? []) {
    if (sub.scheduled_package_id) {
      // มีนัดดาวน์เกรด → apply
      await admin.rpc("apply_package_change", {
        p_hotel_id: sub.hotel_id,
        p_package_id: sub.scheduled_package_id,
        p_reason: "scheduled_downgrade",
      });
      const toFree = sub.scheduled_package_id === freePkg?.id;
      await admin
        .from("subscriptions")
        .update(
          toFree
            ? { status: "canceled", scheduled_package_id: null, scheduled_cycle: null, updated_at: now }
            : {
                status: "grace",
                package_id: sub.scheduled_package_id,
                billing_cycle: sub.scheduled_cycle ?? sub.billing_cycle,
                grace_until: addDays(GRACE_DAYS),
                scheduled_package_id: null,
                scheduled_cycle: null,
                updated_at: now,
              },
        )
        .eq("id", sub.id);
      results.scheduled_applied++;
    } else {
      // หมดรอบเฉยๆ → grace รอจ่ายต่ออายุ
      await admin
        .from("subscriptions")
        .update({ status: "grace", grace_until: addDays(GRACE_DAYS), updated_at: now })
        .eq("id", sub.id);
      await admin.rpc("log_audit", {
        p_hotel_id: sub.hotel_id,
        p_action: "subscription.grace",
        p_entity_type: "subscription",
        p_entity_id: sub.id,
        p_new: { grace_until: addDays(GRACE_DAYS) },
      });
      results.entered_grace++;
    }
  }

  // ── 3) grace ที่เกินกำหนด → Free ──
  const { data: expired } = await admin
    .from("subscriptions")
    .select("*")
    .eq("status", "grace")
    .lt("grace_until", now);

  for (const sub of expired ?? []) {
    if (freePkg) {
      await admin.rpc("apply_package_change", {
        p_hotel_id: sub.hotel_id,
        p_package_id: freePkg.id,
        p_reason: "grace_expired",
      });
    }
    await admin
      .from("subscriptions")
      .update({ status: "expired", updated_at: now })
      .eq("id", sub.id);
    await admin.rpc("log_audit", {
      p_hotel_id: sub.hotel_id,
      p_action: "subscription.expired",
      p_entity_type: "subscription",
      p_entity_id: sub.id,
      p_note: "grace หมด — downgrade เป็น Free",
    });
    results.downgraded++;
  }

  return NextResponse.json({ ok: true, ...results });
}

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}
