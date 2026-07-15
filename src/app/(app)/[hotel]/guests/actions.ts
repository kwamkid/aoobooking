"use server";

import { revalidateHotel } from "@/lib/hotel/revalidate";
import { requireHotelMember } from "@/lib/auth";
import { requirePermission } from "@/lib/permission";
import { createClient } from "@/lib/supabase/server";

// บันทึกข้อมูล ID + PDPA consent (§20.1) — ต้องมีสิทธิ์ guests.edit
export async function updateGuestId(fd: FormData) {
  const hotelSlug = fd.get("hotelSlug") as string;
  const guestId = fd.get("guestId") as string;
  const { hotel } = await requireHotelMember(hotelSlug);
  await requirePermission(hotel.id, "guests.edit");

  const idType = (fd.get("id_type") as string) || null;
  const idNumber = (fd.get("id_number") as string)?.trim() || null;
  const consentGiven = fd.get("pdpa_consent") === "on";

  const supabase = await createClient();

  // ผู้ให้ consent + timestamp (เก็บครั้งแรกที่ติ๊ก — ไม่ทับถ้าเคยให้แล้ว)
  const { data: existing } = await supabase
    .from("guests")
    .select("pdpa_consent_at")
    .eq("id", guestId)
    .eq("hotel_id", hotel.id)
    .single();

  const alreadyConsented = (existing as { pdpa_consent_at: string | null } | null)
    ?.pdpa_consent_at;

  const { error } = await supabase
    .from("guests")
    .update({
      id_type: idType as "national_id" | "passport" | null,
      id_number: idNumber,
      updated_at: new Date().toISOString(),
      // เก็บ consent ครั้งแรกที่ติ๊ก (ไม่ทับของเดิม)
      ...(consentGiven && !alreadyConsented
        ? { pdpa_consent_at: new Date().toISOString() }
        : {}),
    })
    .eq("id", guestId)
    .eq("hotel_id", hotel.id);
  if (error) throw new Error(error.message);

  await supabase.rpc("log_audit", {
    p_hotel_id: hotel.id,
    p_action: "guest.id_updated",
    p_entity_type: "guest",
    p_entity_id: guestId,
    p_new: { id_type: idType, has_consent: consentGiven },
  });
  revalidateHotel(hotelSlug, "/guests");
}

// ลบข้อมูล ID (right to erasure PDPA) — ต้องมีสิทธิ์ guests.edit
export async function eraseGuestId(fd: FormData) {
  const hotelSlug = fd.get("hotelSlug") as string;
  const guestId = fd.get("guestId") as string;
  const { hotel } = await requireHotelMember(hotelSlug);
  await requirePermission(hotel.id, "guests.edit");

  const supabase = await createClient();
  const { error } = await supabase
    .from("guests")
    .update({
      id_number: null,
      id_photo_path: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", guestId)
    .eq("hotel_id", hotel.id);
  if (error) throw new Error(error.message);

  await supabase.rpc("log_audit", {
    p_hotel_id: hotel.id,
    p_action: "guest.id_erased",
    p_entity_type: "guest",
    p_entity_id: guestId,
    p_note: "PDPA right to erasure",
  });
  revalidateHotel(hotelSlug, "/guests");
}
