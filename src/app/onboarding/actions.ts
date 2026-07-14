"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hotelHref } from "@/lib/hotel/href";

// slug ห้ามชนกับ route ระบบ — booking engine ใช้ /[hotelSlug] ที่ root
const RESERVED_SLUGS = new Set([
  "login",
  "onboarding",
  "invite",
  "auth",
  "api",
  "no-access",
  "super-admin",
  "dashboard",
  "settings",
  "legal",
  "about",
  "pricing",
  "contact",
  "help",
  "admin",
  "app",
  "www",
  "design",
]);

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 50)
    .replace(/^-|-$/g, "");
}

export async function createHotel(formData: FormData) {
  const user = await requireUser();
  const supabase = await createClient();

  const name = (formData.get("name") as string)?.trim();
  const rawSlug = (formData.get("slug") as string)?.trim();
  if (!name) throw new Error("กรุณากรอกชื่อโรงแรม");

  const slug = slugify(rawSlug || name);
  if (!slug) throw new Error("slug ไม่ถูกต้อง");
  if (RESERVED_SLUGS.has(slug)) throw new Error("slug นี้เป็นชื่อสงวนของระบบ");

  // free plan เป็น default
  const { data: freePlan } = await supabase
    .from("packages")
    .select("id")
    .eq("slug", "free")
    .single();

  // owner membership ถูกเพิ่มอัตโนมัติโดย DB trigger on_hotel_created
  const { data: hotel, error } = await supabase
    .from("hotels")
    .insert({
      name,
      slug,
      owner_id: user.id,
      package_id: freePlan?.id ?? null,
    })
    .select("slug")
    .single();

  if (error) {
    if (error.code === "23505") throw new Error("slug นี้ถูกใช้แล้ว");
    throw new Error(error.message);
  }

  redirect(hotelHref("/dashboard", hotel.slug));
}
