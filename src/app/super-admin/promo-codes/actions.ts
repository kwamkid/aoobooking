"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export interface CreatePromoCodeInput {
  code: string;
  packageId: string;
  freeMonths: number;
  /** ว่าง/undefined = ไม่จำกัดจำนวนครั้ง */
  maxUses?: number | null;
  /** YYYY-MM-DD — ว่าง/undefined = ไม่หมดอายุ */
  expiresAt?: string | null;
  note?: string | null;
}

export async function createPromoCode(input: CreatePromoCodeInput) {
  // layout guard ไม่คุม server action — ต้องเช็คสิทธิ์เองทุกครั้ง
  const user = await requireSuperAdmin();

  const code = input.code.trim().toUpperCase();
  if (!code) throw new Error("กรุณาใส่โค้ด");
  if (!input.packageId) throw new Error("กรุณาเลือกแพ็กเกจ");

  const freeMonths = Number(input.freeMonths);
  if (!Number.isInteger(freeMonths) || freeMonths < 1) {
    throw new Error("จำนวนเดือนฟรีต้องเป็นจำนวนเต็มอย่างน้อย 1 เดือน");
  }

  const maxUses =
    input.maxUses == null || Number.isNaN(input.maxUses) ? null : Number(input.maxUses);
  if (maxUses != null && (!Number.isInteger(maxUses) || maxUses < 1)) {
    throw new Error("จำกัดจำนวนครั้งต้องเป็นจำนวนเต็มอย่างน้อย 1 (เว้นว่าง = ไม่จำกัด)");
  }

  // date input ให้ YYYY-MM-DD → เก็บเป็น timestamptz สิ้นวัน (ใช้ได้ถึงสิ้นวันนั้น)
  const expiresAt = input.expiresAt?.trim()
    ? new Date(`${input.expiresAt.trim()}T23:59:59`).toISOString()
    : null;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("promo_codes")
    .insert({
      code,
      package_id: input.packageId,
      free_months: freeMonths,
      max_uses: maxUses,
      expires_at: expiresAt,
      note: input.note?.trim() || null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) {
    // unique constraint บน code
    if (error.code === "23505") throw new Error("โค้ดนี้มีอยู่แล้ว");
    throw new Error(error.message);
  }

  // platform-level → ไม่ผูก hotel (omit p_hotel_id)
  await admin.rpc("log_audit", {
    p_action: "promo_code.created",
    p_entity_type: "promo_code",
    p_entity_id: data.id,
    p_new: { code, package_id: input.packageId, free_months: freeMonths, max_uses: maxUses },
  });

  revalidatePath("/super-admin/promo-codes");
}

export async function togglePromoCode(id: string, isActive: boolean) {
  await requireSuperAdmin();

  const admin = createAdminClient();
  const { error } = await admin
    .from("promo_codes")
    .update({ is_active: isActive })
    .eq("id", id);
  if (error) throw new Error(error.message);

  await admin.rpc("log_audit", {
    p_action: isActive ? "promo_code.activated" : "promo_code.deactivated",
    p_entity_type: "promo_code",
    p_entity_id: id,
    p_new: { is_active: isActive },
  });

  revalidatePath("/super-admin/promo-codes");
}
