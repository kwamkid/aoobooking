import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

// ============================================================================
// Package resolver — จุดเดียวในระบบที่คำนวณ effective limits/flags
// อ่าน hotels.package_id → packages + hotel_package_overrides → COALESCE(override, default)
// ทุกจุด (page guard, เมนู, ปุ่ม, cron, server action) เรียกตัวนี้เท่านั้น
// ห้ามเขียน COALESCE ซ้ำที่อื่น (NOTES §5)
// ============================================================================

// shape ของแถวที่ query (ชั่วคราวจน database.ts regen หลัง STEP 0 → มี type จริง)
type PackageRow = {
  id: string;
  slug: string;
  name: string;
  max_properties: number | null;
  max_rooms: number | null;
  max_team_members: number | null;
  max_ota_channels: number | null;
  allow_booking_engine: boolean;
  allow_channel_manager: boolean;
  allow_dynamic_pricing: boolean;
  allow_advanced_reports: boolean;
  allow_custom_domain: boolean;
  allow_monthly_rental: boolean;
  remove_branding: boolean;
};
type OverrideRow = {
  max_properties_override: number | null;
  max_rooms_override: number | null;
  max_team_members_override: number | null;
  max_ota_channels_override: number | null;
  allow_booking_engine_override: boolean | null;
  allow_channel_manager_override: boolean | null;
  allow_dynamic_pricing_override: boolean | null;
  allow_advanced_reports_override: boolean | null;
  allow_custom_domain_override: boolean | null;
  allow_monthly_rental_override: boolean | null;
  remove_branding_override: boolean | null;
  expires_at: string | null;
};

export type EffectiveAccess = {
  packageId: string | null;
  packageSlug: string | null;
  packageName: string | null;
  // limits (null = unlimited)
  maxProperties: number | null;
  maxRooms: number | null;
  maxTeamMembers: number | null;
  maxOtaChannels: number | null;
  // feature flags
  allowBookingEngine: boolean;
  allowChannelManager: boolean;
  allowDynamicPricing: boolean;
  allowAdvancedReports: boolean;
  allowCustomDomain: boolean;
  /** โมดูลเสริม: เช่ารายเดือน (เจ้าของสั่ง 2026-07-17) */
  allowMonthlyRental: boolean;
  removeBranding: boolean;
};

// override ที่ยังไม่หมดอายุเท่านั้นถึงมีผล — COALESCE(override, package_default)
function coalesceNum(override: number | null | undefined, base: number | null): number | null {
  return override ?? base;
}
function coalesceBool(override: boolean | null | undefined, base: boolean): boolean {
  return override ?? base;
}

/**
 * คืน effective entitlements ของ hotel
 * ⚠️ ต้องเรียกด้วย hotelId ที่ผ่านการ verify membership มาแล้ว (resolver ไม่เช็คสิทธิ์เอง)
 * cache ต่อ request — hotelId เดียวกันเรียกซ้ำในหน้าเดียวจะไม่ query ซ้ำ
 */
export const resolveAccess = cache(async (hotelId: string): Promise<EffectiveAccess> => {
  const supabase = await createClient();

  const { data: hotel } = await supabase
    .from("hotels")
    .select("package_id")
    .eq("id", hotelId)
    .single();

  const packageId = hotel?.package_id ?? null;

  // hotel ที่ยังไม่มี package (ทฤษฎีไม่ควรเกิด แต่กันไว้) → ค่า Free-ish ที่ปลอดภัยสุด
  if (!packageId) {
    return {
      packageId: null,
      packageSlug: null,
      packageName: null,
      maxProperties: 1,
      maxRooms: 5,
      maxTeamMembers: 2,
      maxOtaChannels: 0,
      allowBookingEngine: false,
      allowChannelManager: false,
      allowDynamicPricing: false,
      allowAdvancedReports: false,
      allowCustomDomain: false,
      allowMonthlyRental: false,
      removeBranding: false,
    };
  }

  const [pkgRes, ovRes] = await Promise.all([
    supabase
      .from("packages")
      .select(
        "id, slug, name, max_properties, max_rooms, max_team_members, max_ota_channels, " +
          "allow_booking_engine, allow_channel_manager, allow_dynamic_pricing, " +
          "allow_advanced_reports, allow_custom_domain, allow_monthly_rental, remove_branding",
      )
      .eq("id", packageId)
      .single(),
    supabase
      .from("hotel_package_overrides")
      .select("*")
      .eq("hotel_id", hotelId)
      .maybeSingle(),
  ]);
  // types เป็น `any` placeholder จน STEP 0 regen — cast ตรงนี้เพื่อ typecheck ผ่าน
  const pkg = pkgRes.data as PackageRow | null;
  const ov = ovRes.data as OverrideRow | null;

  if (!pkg) {
    throw new Error(`resolveAccess: package ${packageId} ไม่พบ (data inconsistency)`);
  }

  // override หมดอายุแล้ว → ไม่นับ
  const activeOv =
    ov && (!ov.expires_at || new Date(ov.expires_at) > new Date()) ? ov : null;

  return {
    packageId: pkg.id,
    packageSlug: pkg.slug,
    packageName: pkg.name,
    maxProperties: coalesceNum(activeOv?.max_properties_override, pkg.max_properties),
    maxRooms: coalesceNum(activeOv?.max_rooms_override, pkg.max_rooms),
    maxTeamMembers: coalesceNum(activeOv?.max_team_members_override, pkg.max_team_members),
    maxOtaChannels: coalesceNum(activeOv?.max_ota_channels_override, pkg.max_ota_channels),
    allowBookingEngine: coalesceBool(
      activeOv?.allow_booking_engine_override,
      pkg.allow_booking_engine,
    ),
    allowChannelManager: coalesceBool(
      activeOv?.allow_channel_manager_override,
      pkg.allow_channel_manager,
    ),
    allowDynamicPricing: coalesceBool(
      activeOv?.allow_dynamic_pricing_override,
      pkg.allow_dynamic_pricing,
    ),
    allowAdvancedReports: coalesceBool(
      activeOv?.allow_advanced_reports_override,
      pkg.allow_advanced_reports,
    ),
    allowCustomDomain: coalesceBool(
      activeOv?.allow_custom_domain_override,
      pkg.allow_custom_domain,
    ),
    allowMonthlyRental: coalesceBool(
      activeOv?.allow_monthly_rental_override,
      pkg.allow_monthly_rental,
    ),
    removeBranding: coalesceBool(activeOv?.remove_branding_override, pkg.remove_branding),
  };
});

// ============================================================================
// assertWithinLimit — นับ usage ปัจจุบันเทียบ limit ก่อน insert ของใหม่
// ถูกเรียกจาก A1 (members), C2/B1 (properties), C3/B2 (rooms)
// throw ข้อความไทยถ้าจะเกิน (null limit = unlimited → ผ่านเสมอ)
// ============================================================================

export type LimitKind = "properties" | "rooms" | "members";

const LIMIT_LABEL: Record<LimitKind, string> = {
  properties: "จำนวนสาขา",
  rooms: "จำนวนห้อง",
  members: "จำนวนสมาชิกทีม",
};

/** นับ usage ปัจจุบันของ resource — อ่านผ่าน RLS (สมาชิกเห็นข้อมูล hotel ตัวเอง) */
async function countUsage(hotelId: string, kind: LimitKind): Promise<number> {
  const supabase = await createClient();
  const table = kind === "members" ? "hotel_members" : kind; // properties / rooms
  const query = supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("hotel_id", hotelId);

  // properties/rooms มี soft delete (deleted_at) — ไม่นับที่ลบแล้ว
  const { count } = kind === "members" ? await query : await query.is("deleted_at", null);
  return count ?? 0;
}

/**
 * เช็คว่าเพิ่ม resource อีก n ตัวยังอยู่ใน limit ไหม — ถ้าเกิน throw
 * @param addCount จำนวนที่กำลังจะเพิ่ม (default 1)
 */
export async function assertWithinLimit(
  hotelId: string,
  kind: LimitKind,
  addCount = 1,
): Promise<void> {
  const access = await resolveAccess(hotelId);
  const limit =
    kind === "properties"
      ? access.maxProperties
      : kind === "rooms"
        ? access.maxRooms
        : access.maxTeamMembers;

  if (limit === null) return; // unlimited

  const used = await countUsage(hotelId, kind);
  if (used + addCount > limit) {
    throw new Error(
      `เกิน${LIMIT_LABEL[kind]}ของแพ็กเกจ (${access.packageName ?? "-"}) — ใช้ ${used}/${limit} แล้ว` +
        (access.packageSlug === "enterprise"
          ? ""
          : " · อัพเกรดแพ็กเกจเพื่อเพิ่ม limit"),
    );
  }
}
