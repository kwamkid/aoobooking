import "server-only";

/**
 * Beam Checkout gateway abstraction (Charges API: CARD_TOKEN + QR_PROMPT_PAY)
 *
 * ตอนนี้ยังไม่มี Beam credentials → ทำงานเป็น "dev mode":
 * - hasBeam() = false → server action จะ mark invoice paid ทันที (ทดสอบ flow ได้)
 * - พอมี BEAM_API_KEY จริง ค่อย implement createCharge ให้เรียก API จริง
 *   (ห้ามแตะ logic ส่วนอื่น — abstraction ตัดตรงนี้ไว้แล้ว)
 */

export function hasBeam(): boolean {
  return Boolean(process.env.BEAM_API_KEY && process.env.BEAM_MERCHANT_ID);
}

export type BeamCharge = {
  chargeId: string;
  /** base64 PNG QR สำหรับ QR_PROMPT_PAY */
  qrImage?: string;
  qrExpiry?: string;
};

export async function createCharge(_params: {
  invoiceId: string;
  amountSatang: number;
  method: "card" | "qr_promptpay";
}): Promise<BeamCharge> {
  // TODO(Beam): POST /charges — referenceId = invoiceId, amount เป็น satang
  // ดู pattern เต็มจาก aoosocial: src/lib/billing/beam*.ts
  throw new Error("Beam ยังไม่ได้ตั้งค่า (BEAM_API_KEY) — ตอนนี้ใช้ dev mode");
}

/** ตรวจ webhook signature — TODO(Beam): HMAC ตาม BEAM_WEBHOOK_SECRET */
export function verifyWebhookSignature(
  _payload: string,
  _signature: string | null,
): boolean {
  if (!process.env.BEAM_WEBHOOK_SECRET) return false;
  // TODO(Beam): เทียบ HMAC จริง — ห้าม return true จนกว่าจะ implement
  return false;
}
