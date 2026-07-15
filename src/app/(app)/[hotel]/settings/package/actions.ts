"use server";

import { revalidatePath } from "next/cache";
import { requireHotelMember, isOwner } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hasBeam, createCharge } from "@/lib/billing/beam";
import { splitVatInclusiveSatang } from "@/lib/billing";
import { settleInvoicePaid } from "@/lib/billing/settle";

// ทุก write ของ billing วิ่งผ่าน service-role (RLS ปิด authenticated write โดยตั้งใจ)
// → เช็คสิทธิ์ owner ที่ app layer ก่อนเสมอ (3 ชั้น: หน้า UI ซ่อนปุ่มด้วย)

type Cycle = "monthly" | "yearly";

async function requireOwner(hotelSlug: string) {
  const ctx = await requireHotelMember(hotelSlug);
  if (!isOwner(ctx.role)) throw new Error("เฉพาะเจ้าของ (owner) เท่านั้นที่เปลี่ยนแพ็กเกจได้");
  return ctx;
}

/** อัพเกรด (หรือเปลี่ยน cycle) — สร้าง invoice → จ่าย → apply ทันที */
export async function upgradePackage(formData: FormData) {
  const hotelSlug = formData.get("hotelSlug") as string;
  const packageSlug = formData.get("packageSlug") as string;
  const cycle = (formData.get("cycle") as Cycle) ?? "monthly";

  const { hotel, user } = await requireOwner(hotelSlug);
  const admin = createAdminClient();

  const { data: pkg } = await admin
    .from("packages")
    .select("*")
    .eq("slug", packageSlug)
    .eq("is_active", true)
    .single();
  if (!pkg) throw new Error("ไม่พบแพ็กเกจ");
  if (pkg.id === hotel.package_id) throw new Error("คุณอยู่แพ็กเกจนี้อยู่แล้ว");

  const priceTHB =
    cycle === "yearly" ? pkg.price_thb_yearly : pkg.price_thb_monthly;
  if (priceTHB == null) throw new Error("แพ็กเกจนี้ไม่เปิดขายแบบ self-service");

  const amountSatang = priceTHB * 100;
  const { vatSatang } = splitVatInclusiveSatang(amountSatang);

  // 1) สร้าง invoice (pending) + log
  const { data: invoice, error } = await admin
    .from("invoices")
    .insert({
      hotel_id: hotel.id,
      package_id: pkg.id,
      billing_cycle: cycle,
      amount_satang: amountSatang,
      vat_satang: vatSatang,
      payment_method: hasBeam() ? "qr_promptpay" : "manual",
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await admin.rpc("log_audit", {
    p_hotel_id: hotel.id,
    p_action: "invoice.created",
    p_entity_type: "invoice",
    p_entity_id: invoice.id,
    p_new: { package: packageSlug, cycle, amount_satang: amountSatang },
    p_note: `upgrade → ${packageSlug}`,
  });

  if (hasBeam()) {
    // TODO(Beam): เปลี่ยนหน้า UI เป็น client flow — createCharge แล้วแสดง QR
    // ให้สแกน, จ่ายจริงจบที่ webhook (ตอนนั้น action นี้ต้องคืนข้อมูล QR
    // ผ่าน useActionState ไม่ใช่ form action ตรงๆ)
    await createCharge({
      invoiceId: invoice.id,
      amountSatang,
      method: "qr_promptpay",
    });
    revalidatePath("/settings/package");
    return;
  }

  // ── dev mode (ยังไม่มี Beam): จ่ายสำเร็จทันที เพื่อเทสต์ flow ครบวง ──
  await settleInvoicePaid(invoice.id, { dev: true });
  revalidatePath("/settings/package");
}

/** ดาวน์เกรด — นัดมีผลตอนจบรอบ (ไม่คืนเงินส่วนที่เหลือ) */
export async function scheduleDowngrade(formData: FormData) {
  const hotelSlug = formData.get("hotelSlug") as string;
  const packageSlug = formData.get("packageSlug") as string;

  const { hotel } = await requireOwner(hotelSlug);
  const admin = createAdminClient();

  const { data: pkg } = await admin
    .from("packages")
    .select("id, slug")
    .eq("slug", packageSlug)
    .single();
  if (!pkg) throw new Error("ไม่พบแพ็กเกจ");

  // usage ปัจจุบันต้องไม่เกิน limit ใหม่
  const { data: violations } = await admin.rpc("check_package_fits", {
    p_hotel_id: hotel.id,
    p_package_id: pkg.id,
  });
  if (violations && violations.length > 0) {
    throw new Error(
      `ดาวน์เกรดไม่ได้ — เกิน limit ของแพ็กเกจใหม่: ${violations.join(", ")} (ลดการใช้งานก่อน)`,
    );
  }

  const { data: sub } = await admin
    .from("subscriptions")
    .select("id, current_period_end")
    .eq("hotel_id", hotel.id)
    .maybeSingle();

  if (!sub) {
    // ไม่มี subscription (เช่น superadmin ตั้งแพ็กให้) → มีผลทันที
    await admin.rpc("apply_package_change", {
      p_hotel_id: hotel.id,
      p_package_id: pkg.id,
      p_reason: "downgrade_immediate(no_subscription)",
    });
  } else {
    await admin
      .from("subscriptions")
      .update({
        scheduled_package_id: pkg.id,
        scheduled_cycle: "monthly",
        updated_at: new Date().toISOString(),
      })
      .eq("id", sub.id);

    await admin.rpc("log_audit", {
      p_hotel_id: hotel.id,
      p_action: "downgrade.scheduled",
      p_entity_type: "subscription",
      p_entity_id: sub.id,
      p_new: {
        to_package: pkg.slug,
        effective_at: sub.current_period_end,
      },
    });
  }
  revalidatePath("/settings/package");
}

/** ยกเลิกดาวน์เกรดที่นัดไว้ */
export async function cancelScheduledDowngrade(formData: FormData) {
  const hotelSlug = formData.get("hotelSlug") as string;
  const { hotel } = await requireOwner(hotelSlug);
  const admin = createAdminClient();

  const { data: sub } = await admin
    .from("subscriptions")
    .select("id, scheduled_package_id")
    .eq("hotel_id", hotel.id)
    .maybeSingle();
  if (!sub?.scheduled_package_id) return;

  await admin
    .from("subscriptions")
    .update({
      scheduled_package_id: null,
      scheduled_cycle: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sub.id);

  await admin.rpc("log_audit", {
    p_hotel_id: hotel.id,
    p_action: "downgrade.cancelled",
    p_entity_type: "subscription",
    p_entity_id: sub.id,
    p_old: { scheduled_package_id: sub.scheduled_package_id },
  });
  revalidatePath("/settings/package");
}

/** ใช้โค้ดโปรโมชัน — รับสิทธิ์ใช้ฟรี (trial)
 *  ต้องเรียกผ่าน createClient() (ไม่ใช่ admin) เพราะ RPC เช็คสิทธิ์ด้วย auth.uid()
 *  ข้างใน (can_manage_hotel) + validate โค้ด (หมดอายุ/ใช้ครบ/ปิด) แล้ว raise ไทย */
export async function redeemPromoCode(formData: FormData) {
  const hotelSlug = formData.get("hotelSlug") as string;
  const code = (formData.get("code") as string)?.trim();
  if (!code) throw new Error("กรุณากรอกโค้ด");

  const { hotel } = await requireOwner(hotelSlug);
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("redeem_promo_code", {
    p_hotel_id: hotel.id,
    p_code: code,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/settings/package");
  return data as unknown as { trial_until: string; free_months: number };
}
