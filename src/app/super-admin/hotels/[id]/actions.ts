"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/*
 * ⚠️ RPC grant_promotion / apply_package_change เช็ค is_super_admin() ข้างใน
 * (อ่าน auth.uid()) → ต้องเรียกด้วย server client ปกติเพื่อให้ JWT ผู้ใช้ติดไปด้วย
 * ห้ามใช้ admin client (service-role ไม่มี auth.uid() → RPC จะ raise 42501)
 * layout ครอบ requireSuperAdmin() ให้แล้ว แต่ action เข้าถึงตรงได้ → ต้องเช็คเอง
 */

export async function grantPromotion(input: {
  hotelId: string;
  packageId: string;
  months: number;
  note?: string;
}) {
  await requireSuperAdmin();

  if (!Number.isInteger(input.months) || input.months < 1) {
    throw new Error("จำนวนเดือนต้องเป็นจำนวนเต็มตั้งแต่ 1 ขึ้นไป");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("grant_promotion", {
    p_hotel_id: input.hotelId,
    p_package_id: input.packageId,
    p_months: input.months,
    p_note: input.note || undefined,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/super-admin/hotels/${input.hotelId}`);
  revalidatePath("/super-admin/hotels");
  return data as unknown as { trial_until: string };
}

export async function changePackage(input: {
  hotelId: string;
  packageId: string;
}) {
  await requireSuperAdmin();

  const supabase = await createClient();
  const { error } = await supabase.rpc("apply_package_change", {
    p_hotel_id: input.hotelId,
    p_package_id: input.packageId,
    p_reason: "superadmin",
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/super-admin/hotels/${input.hotelId}`);
  revalidatePath("/super-admin/hotels");
}
