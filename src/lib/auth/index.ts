import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getCachedUser,
  readAccessTokenFromNextHeaders,
} from "@/lib/supabase/user-cache";

// ---------- role helpers (mirror ของ RLS ใน DB) ----------
export type HotelRole =
  | "owner"
  | "admin"
  | "manager"
  | "front_desk"
  | "housekeeping"
  | "viewer";

const MANAGE_ROLES: HotelRole[] = ["owner", "admin"];
const EDIT_ROLES: HotelRole[] = ["owner", "admin", "manager", "front_desk"];

export function canManage(role: HotelRole) {
  return MANAGE_ROLES.includes(role);
}
export function canEdit(role: HotelRole) {
  return EDIT_ROLES.includes(role);
}
export function isOwner(role: HotelRole) {
  return role === "owner";
}

// ---------- session guards ----------

/** ตัวตนจาก JWT (getClaims) — id/email พอสำหรับทุก guard ในแอป */
export type SessionUser = { id: string; email: string | null };

/** ต้อง login — คืน user หรือ redirect /login
 * cache() = เรียกซ้ำใน request เดียว (layout + page) ไม่ทำงานซ้ำ — รีเซ็ตทุก request
 * authen ผ่าน user-cache (ตรวจ JWT ในเครื่อง + cache 30 วิ) — ⛔ ห้ามเรียก
 * getUser()/getSession() ตรงๆ: ทั้งคู่มี network/แอบ refresh เผา rate limit
 * (bugs.md §Auth 2026-07-24) */
export const requireUser = cache(async (): Promise<SessionUser> => {
  const supabase = await createClient();
  const user = await getCachedUser(supabase);
  // 🔌 จุดเสียบ 2FA (อนาคต): ถ้าผู้ใช้ enroll MFA ไว้และ getSessionAal() ยังเป็น
  // "aal1" → redirect("/login/mfa") ให้ผ่าน challenge ก่อนปล่อยเข้า — วิธี login
  // ทุกแบบ (lib/auth/sign-in.ts) วิ่งผ่าน guard นี้เหมือนกันหมด เสียบที่เดียวพอ
  if (user) return { id: user.id, email: user.email ?? null };

  // ตรวจไม่ผ่านทั้งที่มี token ใน cookie = สะดุดชั่วขณะ (แพ้ refresh race —
  // request นี้กู้เองไม่ได้เพราะมองไม่เห็น cookie ใหม่ของ request ที่ชนะ)
  // → throw ให้ toast บอกกดซ้ำ แทน redirect ที่จะพาไป /login → /onboarding
  // ทั้งที่ login อยู่ · ไม่มี token เลย = logout จริง
  const token = await readAccessTokenFromNextHeaders();
  if (token) {
    throw new Error("เซสชันสะดุดชั่วคราว — ลองกดใหม่อีกครั้ง (ถ้าเป็นซ้ำให้ refresh หน้า)");
  }
  redirect("/login");
});

/** ต้องเป็น superadmin — redirect /no-access ถ้าไม่ใช่ (ไม่ leak ว่ามี route) */
export async function requireSuperAdmin() {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_super_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_super_admin) redirect("/no-access");
  return user;
}

/** ต้องเป็นสมาชิก hotel (จาก slug) — คืน { hotel, role } หรือ redirect
 * cache() ต่อ request: layout + page เรียกคู่กันทุกหน้า → query hotel/member
 * ชุดเดียวแทนสองชุด (ลดโหลดต่อหน้า — เจ้าของขอ 2026-07-24) */
export const requireHotelMember = cache(async (slug: string | undefined) => {
  if (!slug) redirect("/onboarding");
  const supabase = await createClient();
  const user = await requireUser();

  const fetchHotel = () =>
    supabase
      .from("hotels")
      .select("id, slug, name, base_currency, package_id, multi_property")
      .eq("slug", slug)
      .is("deleted_at", null)
      .single();

  // กัน auth refresh race (bugs.md §Auth): request ขนานแย่ง refresh token →
  // query ชั่วขณะ error/วิ่งแบบ anon → มองไม่เห็น hotel ทั้งที่ session ยังดี
  // กติกาตัดสิน: "ไม่มีแถวจริง" (PGRST116 ติดกันหลายรอบ) เท่านั้นถึง redirect
  // /onboarding · error อื่นให้ throw — ผู้ใช้เห็น toast "ลองใหม่" ดีกว่าเด้งหน้า
  // ไปเลือกโรงแรมแล้วงานที่กรอกค้างอยู่หาย
  let hotel: Awaited<ReturnType<typeof fetchHotel>>["data"] = null;
  let lastError: { code?: string; message: string } | null = null;
  for (const delayMs of [0, 300, 700]) {
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    const { data, error } = await fetchHotel();
    if (data) {
      hotel = data;
      lastError = null;
      break;
    }
    lastError = error;
  }

  if (!hotel) {
    // PGRST116 = query สำเร็จแต่ 0 แถว — แต่ 0 แถวก็ยังหลอกได้ ถ้า session อ่าน
    // ไม่ได้ชั่วขณะ supabase-js จะยิง query ด้วย key anon เงียบๆ → RLS กรองหมด
    // โดยไม่ error · เช็คว่ามี token ใน cookie จริง (ไม่ยิง network — ห้ามใช้
    // getSession มันแอบ refresh) ก่อนตัดสินว่า "ไม่ใช่สมาชิกจริงๆ"
    const token = await readAccessTokenFromNextHeaders();
    if (!token || (lastError && lastError.code !== "PGRST116")) {
      throw new Error("เซสชันสะดุดชั่วคราว — ลองกดใหม่อีกครั้ง (ถ้าเป็นซ้ำให้ refresh หน้า)");
    }
    redirect("/onboarding");
  }

  const { data: member, error: memberError } = await supabase
    .from("hotel_members")
    .select("role")
    .eq("hotel_id", hotel.id)
    .eq("user_id", user.id)
    .single();

  if (!member) {
    // เห็น hotel แล้วแต่ membership query ล้ม (ไม่ใช่ 0 แถว) = สะดุดชั่วคราว
    if (memberError && memberError.code !== "PGRST116") {
      throw new Error("เซสชันสะดุดชั่วคราว — ลองกดใหม่อีกครั้ง (ถ้าเป็นซ้ำให้ refresh หน้า)");
    }
    redirect("/no-access");
  }

  return { hotel, role: member.role as HotelRole, user };
});
