"use server";

import { revalidateHotel } from "@/lib/hotel/revalidate";
import { requireHotelMember } from "@/lib/auth";
import { requirePermission } from "@/lib/permission";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import {
  ACCOUNT_METHODS,
  type AccountMethod,
  type PaymentAccountDetails,
} from "@/lib/payment/types";

type PaymentMethod = Database["public"]["Enums"]["payment_method"];

// เปิด/ปิดช่องทางชำระเงินของโรงแรม — มีผลกับตัวเลือกใน payment modal ทันที
export async function togglePaymentMethod(fd: FormData): Promise<void> {
  const hotelSlug = fd.get("hotelSlug") as string;
  const method = fd.get("method") as PaymentMethod;
  const active = fd.get("active") === "1";

  const { hotel } = await requireHotelMember(hotelSlug);
  await requirePermission(hotel.id, "settings.properties");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hotel_payment_methods")
    .update({ active, updated_at: new Date().toISOString() })
    .eq("hotel_id", hotel.id)
    .eq("method", method)
    .select("method")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("ไม่พบช่องทางนี้");

  await supabase.rpc("log_audit", {
    p_hotel_id: hotel.id,
    p_action: "settings.payment_method_toggled",
    p_entity_type: "hotel_payment_method",
    p_old: { method, active: !active },
    p_new: { method, active },
  });

  revalidateHotel(hotelSlug, "/settings/payments", "/bookings");
}

// ── บัญชีรับเงิน (PromptPay / ธนาคาร / เครื่องรูด) — เพิ่ม/แก้/ลบ ─────────────

function buildDetails(method: AccountMethod, fd: FormData): PaymentAccountDetails {
  if (method === "promptpay_qr") {
    const idType = fd.get("idType") as "phone" | "citizen_id";
    const idValue = ((fd.get("idValue") as string) || "").replace(/\D/g, "");
    if (idType !== "phone" && idType !== "citizen_id") throw new Error("เลือกประเภท PromptPay");
    if (idType === "phone" && idValue.length !== 10)
      throw new Error("เบอร์มือถือต้องมี 10 หลัก");
    if (idType === "citizen_id" && idValue.length !== 13)
      throw new Error("เลขบัตรประชาชนต้องมี 13 หลัก");
    return { id_type: idType, id_value: idValue };
  }
  if (method === "bank_transfer") {
    const bank = ((fd.get("bank") as string) || "").trim();
    const accountNumber = ((fd.get("accountNumber") as string) || "").trim();
    const accountName = ((fd.get("accountName") as string) || "").trim();
    if (!bank) throw new Error("เลือกธนาคาร");
    if (!accountNumber) throw new Error("กรอกเลขบัญชี");
    return { bank, account_number: accountNumber, account_name: accountName };
  }
  return {}; // card_terminal — ชื่อเครื่องอย่างเดียวพอ
}

export async function savePaymentAccount(fd: FormData): Promise<void> {
  const hotelSlug = fd.get("hotelSlug") as string;
  const id = (fd.get("id") as string) || null; // null = เพิ่มใหม่
  const method = fd.get("method") as AccountMethod;
  const name = ((fd.get("name") as string) || "").trim();
  const active = fd.get("active") === "1"; // checkbox ไม่ติ๊ก = ไม่มี key = false

  const { hotel } = await requireHotelMember(hotelSlug);
  await requirePermission(hotel.id, "settings.properties");
  if (!ACCOUNT_METHODS.includes(method)) throw new Error("ช่องทางนี้ตั้งบัญชีไม่ได้");
  if (!name) throw new Error("ตั้งชื่อบัญชี/เครื่องก่อน");

  const details = buildDetails(method, fd);
  const supabase = await createClient();

  if (id) {
    const { data, error } = await supabase
      .from("hotel_payment_accounts")
      .update({ name, details, active, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("hotel_id", hotel.id)
      .eq("method", method)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("ไม่พบบัญชีนี้");
  } else {
    const { data: last } = await supabase
      .from("hotel_payment_accounts")
      .select("sort_order")
      .eq("hotel_id", hotel.id)
      .eq("method", method)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { error } = await supabase.from("hotel_payment_accounts").insert({
      hotel_id: hotel.id,
      method,
      name,
      details,
      active,
      sort_order: (last?.sort_order ?? 0) + 1,
    });
    if (error) throw new Error(error.message);
  }

  await supabase.rpc("log_audit", {
    p_hotel_id: hotel.id,
    p_action: id ? "settings.payment_account_updated" : "settings.payment_account_created",
    p_entity_type: "hotel_payment_account",
    p_entity_id: id ?? undefined,
    p_new: { method, name, active },
  });
  revalidateHotel(hotelSlug, "/settings/payments", "/bookings");
}

export async function deletePaymentAccount(fd: FormData): Promise<void> {
  const hotelSlug = fd.get("hotelSlug") as string;
  const id = fd.get("id") as string;

  const { hotel } = await requireHotelMember(hotelSlug);
  await requirePermission(hotel.id, "settings.properties");

  const supabase = await createClient();
  // ลบได้เลย — payments เก่าที่อ้างอยู่ FK on delete set null (ledger ไม่หาย)
  const { data, error } = await supabase
    .from("hotel_payment_accounts")
    .delete()
    .eq("id", id)
    .eq("hotel_id", hotel.id)
    .select("method, name")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("ไม่พบบัญชีนี้");

  await supabase.rpc("log_audit", {
    p_hotel_id: hotel.id,
    p_action: "settings.payment_account_deleted",
    p_entity_type: "hotel_payment_account",
    p_entity_id: id,
    p_old: { method: data.method, name: data.name },
  });
  revalidateHotel(hotelSlug, "/settings/payments", "/bookings");
}
