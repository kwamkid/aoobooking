"use client";

import { createClient } from "@/lib/supabase/client";

/* ============================================================================
 * จุดรวม "วิธี login" ทุกแบบ (แยกจาก UI — เจ้าของสั่ง 2026-07-24 เผื่ออนาคต)
 *
 * เพิ่มวิธี login ใหม่ = เพิ่มฟังก์ชันในไฟล์นี้ + ปุ่มในหน้า /login เท่านั้น
 * ห้ามเรียก supabase.auth.signIn* ตรงจาก component — logic ต้องอยู่ที่นี่ที่เดียว
 *
 * ทุกวิธีจบทางเดียวกัน: ได้ session → cookie → ระบบหลังบ้าน (proxy/user-cache/
 * guard) ไม่ต้องรู้เลยว่า login มาทางไหน — เพิ่ม LINE/อีเมล/OTP ไม่ต้องแก้หลังบ้าน
 *
 * ตัวอย่างวิธีที่เพิ่มได้ (โครงพร้อมแล้ว):
 *   signInWithLine()          → signInWithOAuth({ provider: "..." }) + callback เดิม
 *   signInWithEmailPassword() → auth.signInWithPassword() — ไม่ผ่าน callback
 *   signInWithPhoneOtp()      → auth.signInWithOtp() + หน้ากรอกรหัส
 *
 * 2FA (อนาคต): Supabase MFA (TOTP) — enroll/challenge ผ่าน auth.mfa.* ฝั่ง client
 * ฝั่ง server ประตูอยู่ที่ requireUser + getSessionAal() (lib/supabase/user-cache)
 * ========================================================================== */

/** Google OAuth (PKCE) — เด้งไป Google แล้วกลับเข้า /auth/callback
 * คืน error message (ไทยจาก Supabase) หรือ null ถ้ากำลัง redirect */
export async function signInWithGoogle(
  redirectPath: string = "/onboarding",
): Promise<string | null> {
  const supabase = createClient();
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(redirectPath)}`,
    },
  });
  return error ? error.message : null;
}
