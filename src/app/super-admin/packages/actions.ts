"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";

export interface UpdatePackageInput {
  id: string;
  name: string;
  /** ว่าง/null = ติดต่อฝ่ายขาย (ไม่แสดงราคา) */
  priceThbMonthly?: number | null;
  /** ว่าง/null = ไม่จำกัด (null ใน DB) */
  maxProperties?: number | null;
  maxRooms?: number | null;
  maxTeamMembers?: number | null;
  maxOtaChannels?: number | null;
  allowBookingEngine: boolean;
  allowChannelManager: boolean;
  allowDynamicPricing: boolean;
  allowAdvancedReports: boolean;
  allowCustomDomain: boolean;
  allowMonthlyRental: boolean;
  removeBranding: boolean;
  isActive: boolean;
}

/** limit: ว่าง/undefined/NaN = null (ไม่จำกัด) · ต้องเป็นจำนวนเต็ม >= 0 */
function normalizeLimit(value: number | null | undefined, label: string): number | null {
  if (value == null || Number.isNaN(value)) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`${label} ต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป (เว้นว่าง = ไม่จำกัด)`);
  }
  return n;
}

export async function updatePackage(input: UpdatePackageInput) {
  // layout guard ไม่คุม server action — ต้องเช็คสิทธิ์เองทุกครั้ง
  await requireSuperAdmin();

  if (!input.id) throw new Error("ไม่พบแพ็กเกจ");

  const name = input.name.trim();
  if (!name) throw new Error("กรุณาใส่ชื่อแพ็กเกจ");

  const priceThbMonthly =
    input.priceThbMonthly == null || Number.isNaN(input.priceThbMonthly)
      ? null
      : Number(input.priceThbMonthly);
  if (priceThbMonthly != null && (!Number.isInteger(priceThbMonthly) || priceThbMonthly < 0)) {
    throw new Error("ราคา/เดือน ต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป (เว้นว่าง = ติดต่อฝ่ายขาย)");
  }

  const patch = {
    name,
    price_thb_monthly: priceThbMonthly,
    max_properties: normalizeLimit(input.maxProperties, "จำนวนสาขา"),
    max_rooms: normalizeLimit(input.maxRooms, "จำนวนห้อง"),
    max_team_members: normalizeLimit(input.maxTeamMembers, "จำนวนสมาชิก"),
    max_ota_channels: normalizeLimit(input.maxOtaChannels, "จำนวน OTA"),
    allow_booking_engine: input.allowBookingEngine,
    allow_channel_manager: input.allowChannelManager,
    allow_dynamic_pricing: input.allowDynamicPricing,
    allow_advanced_reports: input.allowAdvancedReports,
    allow_custom_domain: input.allowCustomDomain,
    allow_monthly_rental: input.allowMonthlyRental,
    remove_branding: input.removeBranding,
    is_active: input.isActive,
  };

  const admin = createAdminClient();

  // อ่านค่าเดิมก่อน → เก็บ diff ลง audit (แก้ tier มีผลกับทุกโรงแรมทันที ต้องตามรอยได้)
  const { data: before, error: readError } = await admin
    .from("packages")
    .select(
      "slug, name, price_thb_monthly, max_properties, max_rooms, max_team_members, max_ota_channels, allow_booking_engine, allow_channel_manager, allow_dynamic_pricing, allow_advanced_reports, allow_custom_domain, allow_monthly_rental, remove_branding, is_active",
    )
    .eq("id", input.id)
    .single();
  if (readError) throw new Error(readError.message);

  const { error } = await admin.from("packages").update(patch).eq("id", input.id);
  if (error) throw new Error(error.message);

  // เก็บเฉพาะ field ที่เปลี่ยนจริง → diff อ่านง่าย ไม่รก
  const changedKeys = (Object.keys(patch) as (keyof typeof patch)[]).filter(
    (k) => before[k as keyof typeof before] !== patch[k],
  );
  const oldData: Record<string, Json> = {};
  const newData: Record<string, Json> = {};
  for (const k of changedKeys) {
    oldData[k] = before[k as keyof typeof before];
    newData[k] = patch[k];
  }

  if (changedKeys.length > 0) {
    // platform-level → ไม่ผูก hotel (omit p_hotel_id)
    await admin.rpc("log_audit", {
      p_action: "package.updated",
      p_entity_type: "package",
      p_entity_id: input.id,
      p_old: oldData,
      p_new: newData,
      p_note: `แก้แพ็กเกจ ${before.slug}`,
    });
  }

  revalidatePath("/super-admin/packages");
}
