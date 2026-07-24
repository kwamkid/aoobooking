"use server";

import { revalidateHotel } from "@/lib/hotel/revalidate";
import { requireHotelMember } from "@/lib/auth";
import { requirePermission } from "@/lib/permission";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import { ACCOUNT_METHODS, type PaymentAccount } from "@/lib/payment/types";

/* การชำระเงินต่อ booking — ledger (rules #12): ทุกรายการเป็น transaction แยกแถว
 * (มัดจำ → จ่ายเพิ่ม → refund) ไม่แก้ทับ · เขียนผ่าน RPC record_payment /
 * verify_slip_payment (SECURITY DEFINER เช็ค user_can + log_audit ในตัว) */

type PaymentMethod = Database["public"]["Enums"]["payment_method"];
type PaymentStatus = Database["public"]["Enums"]["payment_status"];

export type PaymentRow = {
  id: string;
  direction: "charge" | "refund";
  amount_satang: number;
  method: PaymentMethod;
  status: PaymentStatus;
  note: string | null;
  created_at: string;
  confirmed_at: string | null;
  void_reason: string | null;
  /** refund ชี้กลับ charge ก้อนที่คืน (null = refund อัตโนมัติจาก cancel/no-show) */
  reference_payment_id: string | null;
  /** ชื่อบัญชี/เครื่องที่รับเงิน (null = ไม่ได้ระบุ หรือบัญชีถูกลบ) */
  account_name: string | null;
  /** signed URL ชั่วคราว (bucket private) — null ถ้าไม่มีสลิป */
  slip_url: string | null;
};

export type BookingPaymentInfo = {
  totalSatang: number;
  paidSatang: number; // sum confirmed: charge − refund
  balanceSatang: number;
  payments: PaymentRow[];
  /** ช่องทางที่โรงแรมเปิดใช้ (ตั้งค่า > ช่องทางชำระเงิน) เรียงตาม sort_order */
  methods: PaymentMethod[];
  /** บัญชีรับเงินที่เปิดใช้ (PromptPay/ธนาคาร/เครื่องรูด) — เลือกตอนบันทึก + ขึ้น QR */
  accounts: PaymentAccount[];
};

// ── ประวัติการชำระ + ยอดสด (จาก view booking_balances) ─────────────────────
export async function getBookingPayments(
  hotelSlug: string,
  bookingId: string,
): Promise<BookingPaymentInfo> {
  const { hotel } = await requireHotelMember(hotelSlug);
  await requirePermission(hotel.id, "payments.view");

  const supabase = await createClient();
  const [{ data: bal }, { data: pays, error }, { data: methodRows }, { data: accountRows }] =
    await Promise.all([
    supabase
      .from("booking_balances")
      .select("total_satang, paid_satang, balance_satang")
      .eq("booking_id", bookingId)
      .eq("hotel_id", hotel.id)
      .maybeSingle(),
    supabase
      .from("payments")
      .select("id, direction, amount_satang, method, status, note, created_at, confirmed_at, void_reason, reference_payment_id, slip_path, account:hotel_payment_accounts(name)")
      .eq("booking_id", bookingId)
      .eq("hotel_id", hotel.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("hotel_payment_methods")
      .select("method")
      .eq("hotel_id", hotel.id)
      .eq("active", true)
      .order("sort_order"),
    supabase
      .from("hotel_payment_accounts")
      .select("id, method, name, details, active")
      .eq("hotel_id", hotel.id)
      .eq("active", true)
      .in("method", [...ACCOUNT_METHODS])
      .order("sort_order"),
  ]);
  if (error) throw new Error(error.message);
  if (!bal) throw new Error("ไม่พบการจอง");

  type Raw = Omit<PaymentRow, "slip_url" | "account_name"> & {
    slip_path: string | null;
    account: { name: string } | null;
  };
  const rows = (pays ?? []) as unknown as Raw[];

  // สลิปอยู่ bucket private → แปลงเป็น signed URL (1 ชม.) ทีเดียวทั้งชุด
  const slipPaths = rows.filter((p) => p.slip_path).map((p) => p.slip_path!);
  const signed = new Map<string, string>();
  if (slipPaths.length > 0) {
    const { data: urls } = await supabase.storage
      .from("payment-slips")
      .createSignedUrls(slipPaths, 3600);
    for (const u of urls ?? []) {
      if (u.path && u.signedUrl) signed.set(u.path, u.signedUrl);
    }
  }

  return {
    // view columns เป็น nullable ใน generated types (left join) — ข้อมูลจริงมีเสมอ
    totalSatang: bal.total_satang ?? 0,
    paidSatang: bal.paid_satang ?? 0,
    balanceSatang: bal.balance_satang ?? 0,
    payments: rows.map(({ slip_path, account, ...p }) => ({
      ...p,
      account_name: account?.name ?? null,
      slip_url: slip_path ? (signed.get(slip_path) ?? null) : null,
    })),
    methods: (methodRows ?? []).map((m) => m.method as PaymentMethod),
    accounts: (accountRows ?? []) as PaymentAccount[],
  };
}

// ── สรุปบิลตอนเช็คเอาท์ — ยอด/ประวัติ (getBookingPayments) + รายการ folio ────
export type CheckoutFolioItem = {
  id: string;
  description: string;
  qty: number;
  /** ยอดรวมของรายการ (gross — รวมภาษีตามโหมด property แล้ว) */
  totalSatang: number;
};

export type CheckoutSummary = BookingPaymentInfo & { folioItems: CheckoutFolioItem[] };

export async function getCheckoutSummary(
  hotelSlug: string,
  bookingId: string,
): Promise<CheckoutSummary> {
  const info = await getBookingPayments(hotelSlug, bookingId); // เช็คสิทธิ์ payments.view ในตัว
  const supabase = await createClient();

  const [{ data: fol }, { data: bk }] = await Promise.all([
    supabase
      .from("folios")
      .select(
        "folio_items(id, description, qty, amount_satang, vat_satang, service_charge_satang, voided_at, created_at)",
      )
      .eq("booking_id", bookingId)
      .maybeSingle(),
    supabase
      .from("bookings")
      .select("property:properties(tax_inclusive)")
      .eq("id", bookingId)
      .maybeSingle(),
  ]);
  const taxInclusive =
    (bk?.property as { tax_inclusive: boolean } | null)?.tax_inclusive ?? true;

  type Raw = {
    id: string;
    description: string;
    qty: number;
    amount_satang: number;
    vat_satang: number;
    service_charge_satang: number;
    voided_at: string | null;
    created_at: string;
  };
  const folioItems = ((fol?.folio_items ?? []) as Raw[])
    .filter((i) => !i.voided_at)
    .sort((a, z) => a.created_at.localeCompare(z.created_at))
    .map((i) => ({
      id: i.id,
      description: i.description,
      qty: i.qty,
      totalSatang:
        i.amount_satang + (taxInclusive ? 0 : i.vat_satang + i.service_charge_satang),
    }));

  return { ...info, folioItems };
}

// ── บันทึกรับเงิน (มัดจำ/จ่ายเพิ่ม/จ่ายครบ) → คืน payment id ────────────────
// cash/บัตร/QR = confirmed ทันที · โอน = pending รอ verify สลิป (ตรรกะอยู่ใน RPC)
export async function recordBookingPayment(fd: FormData): Promise<string> {
  const hotelSlug = fd.get("hotelSlug") as string;
  const bookingId = fd.get("bookingId") as string;
  const method = fd.get("method") as PaymentMethod;
  const note = ((fd.get("note") as string) || "").trim() || null;

  const { hotel } = await requireHotelMember(hotelSlug);
  await requirePermission(hotel.id, "payments.charge");

  // จำนวนเงินกรอกเป็นบาท (ทศนิยมได้) → เก็บ satang bigint (rules #1)
  const amountBaht = Number(String(fd.get("amount") ?? "").replace(/,/g, ""));
  const amountSatang = Math.round(amountBaht * 100);
  if (!Number.isFinite(amountBaht) || amountSatang <= 0) {
    throw new Error("จำนวนเงินต้องมากกว่า 0");
  }

  const supabase = await createClient();

  // สลิปโอน (ถ้าแนบ) → อัพเข้า bucket private path {hotel_id}/... (storage policy บังคับ)
  let slipPath: string | null = null;
  const slip = fd.get("slip");
  if (slip instanceof File && slip.size > 0) {
    if (slip.size > 5 * 1024 * 1024) throw new Error("ไฟล์สลิปต้องไม่เกิน 5MB");
    if (!slip.type.startsWith("image/")) throw new Error("สลิปต้องเป็นรูปภาพ");
    const ext = slip.name.split(".").pop()?.toLowerCase() || "jpg";
    slipPath = `${hotel.id}/${bookingId}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("payment-slips")
      .upload(slipPath, slip, { contentType: slip.type });
    if (upErr) throw new Error(`อัพโหลดสลิปไม่สำเร็จ: ${upErr.message}`);
  }

  const accountId = (fd.get("accountId") as string) || null;
  const { data: paymentId, error } = await supabase.rpc("record_payment", {
    p_booking_id: bookingId,
    p_amount_satang: amountSatang,
    p_method: method,
    p_slip_path: slipPath ?? undefined,
    p_note: note ?? undefined,
    // RPC เช็คซ้ำว่าบัญชีเป็นของโรงแรม + method ตรง (กันยิงข้าม tenant)
    p_account_id: accountId ?? undefined,
  });
  if (error) throw new Error(error.message);

  revalidateHotel(hotelSlug, "/bookings", "/front-desk", "/dashboard");
  return paymentId as string;
}

// ── ตีรายการเป็นโมฆะ (payments.void) — บันทึกผิด → void แล้วบันทึกใหม่ ─────
// ledger ห้ามลบ/แก้ทับ (rules #12) · แถวยังอยู่พร้อมเหตุผล + audit log
export async function voidBookingPayment(fd: FormData): Promise<void> {
  const hotelSlug = fd.get("hotelSlug") as string;
  const paymentId = fd.get("paymentId") as string;
  const reason = ((fd.get("reason") as string) || "").trim();

  const { hotel } = await requireHotelMember(hotelSlug);
  await requirePermission(hotel.id, "payments.void");
  if (!reason) throw new Error("ต้องระบุเหตุผลที่ยกเลิกรายการ");

  const supabase = await createClient();
  const { error } = await supabase.rpc("void_payment", {
    p_payment_id: paymentId,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);

  revalidateHotel(hotelSlug, "/bookings", "/front-desk", "/dashboard");
}

// ── คืนเงินอ้างอิงรายการรับ (payments.refund) — BLUEPRINT §14.7 ─────────────
// คืนจริงเกิดนอกระบบ (ยื่นสด/โอนกลับ) แล้วมาบันทึก → confirmed ทันที
// RPC กันยอดคืนรวมเกินก้อนที่อ้างอิง + เช็คบัญชีเป็นของโรงแรม
export async function refundBookingPayment(fd: FormData): Promise<void> {
  const hotelSlug = fd.get("hotelSlug") as string;
  const paymentId = fd.get("paymentId") as string; // charge ก้อนที่คืน
  const method = fd.get("method") as PaymentMethod;
  const note = ((fd.get("note") as string) || "").trim() || null;
  const accountId = (fd.get("accountId") as string) || null;

  const { hotel } = await requireHotelMember(hotelSlug);
  await requirePermission(hotel.id, "payments.refund");

  const amountBaht = Number(String(fd.get("amount") ?? "").replace(/,/g, ""));
  const amountSatang = Math.round(amountBaht * 100);
  if (!Number.isFinite(amountBaht) || amountSatang <= 0) {
    throw new Error("จำนวนเงินต้องมากกว่า 0");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("refund_payment", {
    p_payment_id: paymentId,
    p_amount_satang: amountSatang,
    p_method: method,
    p_account_id: accountId ?? undefined,
    p_note: note ?? undefined,
  });
  if (error) throw new Error(error.message);

  revalidateHotel(hotelSlug, "/bookings", "/front-desk", "/dashboard");
}

// ── ยืนยันคืนจริงของ refund pending (สร้างอัตโนมัติตอน cancel/no-show) ───────
export async function confirmRefundPayment(fd: FormData): Promise<void> {
  const hotelSlug = fd.get("hotelSlug") as string;
  const paymentId = fd.get("paymentId") as string; // refund pending
  const method = fd.get("method") as PaymentMethod;
  const note = ((fd.get("note") as string) || "").trim() || null;
  const accountId = (fd.get("accountId") as string) || null;

  const { hotel } = await requireHotelMember(hotelSlug);
  await requirePermission(hotel.id, "payments.refund");

  const supabase = await createClient();
  const { error } = await supabase.rpc("confirm_refund", {
    p_payment_id: paymentId,
    p_method: method,
    p_account_id: accountId ?? undefined,
    p_note: note ?? undefined,
  });
  if (error) throw new Error(error.message);

  revalidateHotel(hotelSlug, "/bookings", "/front-desk", "/dashboard");
}

// ── ยืนยัน/ปฏิเสธ สลิปโอน (payments.verify_slip) ───────────────────────────
export async function verifyBookingSlip(fd: FormData): Promise<void> {
  const hotelSlug = fd.get("hotelSlug") as string;
  const paymentId = fd.get("paymentId") as string;
  const approve = fd.get("approve") === "1";

  const { hotel } = await requireHotelMember(hotelSlug);
  await requirePermission(hotel.id, "payments.verify_slip");

  const supabase = await createClient();
  const { error } = await supabase.rpc("verify_slip_payment", {
    p_payment_id: paymentId,
    p_approve: approve,
  });
  if (error) throw new Error(error.message);

  revalidateHotel(hotelSlug, "/bookings", "/front-desk", "/dashboard");
}
