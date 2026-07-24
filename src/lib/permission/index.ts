import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

// ============================================================================
// Permission ฝั่ง app — DB (RPC user_can) เป็น source of truth ตัวจริง (NOTES §5)
// cache ต่อ request (สิทธิ์เดิมในหน้าเดียวไม่ยิง RPC ซ้ำ) · ห้าม cache ข้ามrequest
// (สิทธิ์เพิ่งถูกแก้ต้องมีผลทันที — React cache() รีเซ็ตทุก request อยู่แล้ว)
// ============================================================================

/** เช็คว่า caller มี permission ใน hotel ไหม — เรียก RPC user_can (owner=true เสมอ) */
export const can = cache(
  async (hotelId: string, permission: string): Promise<boolean> => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("user_can", {
      p_hotel_id: hotelId,
      p_permission: permission,
    });
    if (error) return false; // fail closed
    return data === true;
  },
);

/** เช็คหลาย permission ในรอบเดียว (RPC user_can_many — migration 000044)
 * หน้าที่เช็คสิทธิ์เป็นสิบตัวใช้ตัวนี้แทน can() หลายรอบ: 1 HTTP call แทน N
 * (ลดโหลดต่อหน้า — เจ้าของขอ 2026-07-24) · fail closed เหมือน can() */
export async function canMany<T extends string>(
  hotelId: string,
  permissions: readonly T[],
): Promise<Record<T, boolean>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("user_can_many", {
    p_hotel_id: hotelId,
    p_permissions: [...permissions] as string[],
  });
  const map = error ? {} : ((data ?? {}) as unknown as Record<string, boolean>);
  return Object.fromEntries(
    permissions.map((p) => [p, map[p] === true]),
  ) as Record<T, boolean>;
}

/** throw ถ้าไม่มีสิทธิ์ — ใช้ต้นทาง server action / page guard (ชั้นที่ 2 ของ 3 ชั้น) */
export async function requirePermission(
  hotelId: string,
  permission: string,
): Promise<void> {
  if (!(await can(hotelId, permission))) {
    throw new Error(`ไม่มีสิทธิ์ (${permission})`);
  }
}
