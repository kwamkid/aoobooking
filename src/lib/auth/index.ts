import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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

/** ต้อง login — คืน user หรือ redirect /login */
export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return user;
}

/** ต้องเป็น superadmin — redirect /no-access ถ้าไม่ใช่ (ไม่ leak ว่ามี route) */
export async function requireSuperAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_super_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_super_admin) redirect("/no-access");
  return user;
}

/** ต้องเป็นสมาชิก hotel (จาก slug) — คืน { hotel, role } หรือ redirect */
export async function requireHotelMember(slug: string | undefined) {
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

  let { data: hotel } = await fetchHotel();

  // กัน auth refresh race: request ขนานกันแย่ง refresh token → ตัวที่แพ้ได้
  // AuthRefreshDiscardedError ชั่วขณะ → RLS มองไม่เห็น hotel → เด้ง /onboarding
  // ทั้งที่ session จริงยังดี (bugs.md §Auth) — ลองใหม่หนึ่งครั้งก่อนตัดสิน
  if (!hotel) {
    await new Promise((r) => setTimeout(r, 250));
    ({ data: hotel } = await fetchHotel());
  }

  if (!hotel) redirect("/onboarding");

  const { data: member } = await supabase
    .from("hotel_members")
    .select("role")
    .eq("hotel_id", hotel.id)
    .eq("user_id", user.id)
    .single();

  if (!member) redirect("/no-access");

  return { hotel, role: member.role as HotelRole, user };
}
