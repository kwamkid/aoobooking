"use server";

import { revalidatePath } from "next/cache";
import { requireHotelMember } from "@/lib/auth";
import { requirePermission } from "@/lib/permission";
import { assertWithinLimit } from "@/lib/package/resolve-access";
import { createClient } from "@/lib/supabase/server";

// slug จากชื่อสาขา — a-z0-9 + ขีด (booking engine: /hotel/property)
function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || `branch-${Date.now().toString(36)}`;
}

type PropInput = {
  name: string;
  slug?: string;
  address?: string;
  phone?: string;
  timezone: string;
  check_in_time: string;
  check_out_time: string;
  vat_percent: number;
  service_charge_percent: number;
  tax_inclusive: boolean;
};

function parseForm(fd: FormData): PropInput {
  return {
    name: (fd.get("name") as string)?.trim(),
    slug: (fd.get("slug") as string)?.trim() || undefined,
    address: (fd.get("address") as string)?.trim() || undefined,
    phone: (fd.get("phone") as string)?.trim() || undefined,
    timezone: (fd.get("timezone") as string) || "Asia/Bangkok",
    check_in_time: (fd.get("check_in_time") as string) || "14:00",
    check_out_time: (fd.get("check_out_time") as string) || "12:00",
    vat_percent: Number(fd.get("vat_percent") ?? 7),
    service_charge_percent: Number(fd.get("service_charge_percent") ?? 0),
    tax_inclusive: fd.get("tax_inclusive") === "on",
  };
}

/** สร้างสาขาใหม่ */
export async function createProperty(fd: FormData) {
  const hotelSlug = fd.get("hotelSlug") as string;
  const { hotel } = await requireHotelMember(hotelSlug);
  await requirePermission(hotel.id, "settings.properties");

  const input = parseForm(fd);
  if (!input.name) throw new Error("กรุณาใส่ชื่อสาขา");

  // เช็ค limit ก่อน insert (ผ่าน resolver ตัวเดียว)
  await assertWithinLimit(hotel.id, "properties");

  const supabase = await createClient();
  const slug = input.slug ? slugify(input.slug) : slugify(input.name);

  const { data: created, error } = await supabase
    .from("properties")
    .insert({ hotel_id: hotel.id, slug, ...propColumns(input) })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") throw new Error(`slug "${slug}" ถูกใช้แล้วในโรงแรมนี้`);
    throw new Error(error.message);
  }

  await supabase.rpc("log_audit", {
    p_hotel_id: hotel.id,
    p_action: "property.created",
    p_entity_type: "property",
    p_entity_id: (created as { id: string }).id,
    p_new: { name: input.name, slug },
  });

  revalidatePath("/settings/properties");
}

/** แก้สาขา */
export async function updateProperty(fd: FormData) {
  const hotelSlug = fd.get("hotelSlug") as string;
  const propertyId = fd.get("propertyId") as string;
  const { hotel } = await requireHotelMember(hotelSlug);
  await requirePermission(hotel.id, "settings.properties");

  const input = parseForm(fd);
  if (!input.name) throw new Error("กรุณาใส่ชื่อสาขา");

  const supabase = await createClient();
  const { error } = await supabase
    .from("properties")
    .update({ ...propColumns(input), updated_at: new Date().toISOString() })
    .eq("id", propertyId)
    .eq("hotel_id", hotel.id);
  if (error) throw new Error(error.message);

  await supabase.rpc("log_audit", {
    p_hotel_id: hotel.id,
    p_action: "property.updated",
    p_entity_type: "property",
    p_entity_id: propertyId,
    p_new: { name: input.name },
  });

  revalidatePath("/settings/properties");
}

/** ปิดสาขา (soft delete) */
export async function deleteProperty(fd: FormData) {
  const hotelSlug = fd.get("hotelSlug") as string;
  const propertyId = fd.get("propertyId") as string;
  const { hotel } = await requireHotelMember(hotelSlug);
  await requirePermission(hotel.id, "settings.properties");

  const supabase = await createClient();
  const { error } = await supabase
    .from("properties")
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq("id", propertyId)
    .eq("hotel_id", hotel.id);
  if (error) throw new Error(error.message);

  await supabase.rpc("log_audit", {
    p_hotel_id: hotel.id,
    p_action: "property.deleted",
    p_entity_type: "property",
    p_entity_id: propertyId,
  });

  revalidatePath("/settings/properties");
}

// column mapping (ไม่รวม slug — set แยกตอน create)
function propColumns(i: PropInput) {
  return {
    name: i.name,
    address: i.address ?? null,
    phone: i.phone ?? null,
    timezone: i.timezone,
    check_in_time: i.check_in_time,
    check_out_time: i.check_out_time,
    vat_percent: i.vat_percent,
    service_charge_percent: i.service_charge_percent,
    tax_inclusive: i.tax_inclusive,
  };
}
