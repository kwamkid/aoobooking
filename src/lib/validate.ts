/* validate ข้อมูลติดต่อ — ใช้ทั้งฝั่งฟอร์ม (client) และ server action (อย่าเชื่อ client)
 * เบอร์โทร: รองรับ international format (E.164) — "+66 81-234-5678" / "0812345678" */

/** ตัด space/ขีด/วงเล็บ/จุด ออกจากเบอร์ → คืนเบอร์สะอาด หรือ null ถ้า format ไม่ถูก
 *  เกณฑ์: ตัวเลขล้วน 7–15 หลัก · ขึ้นต้น + ได้ (ตาม E.164) · เบอร์ไทย 0xxxxxxxxx ผ่าน */
export function normalizePhone(input: string): string | null {
  const cleaned = input.replace(/[\s\-().]/g, "");
  if (!/^\+?\d{7,15}$/.test(cleaned)) return null;
  return cleaned;
}

export function isValidEmail(input: string): boolean {
  // เกณฑ์เชิงปฏิบัติ: local@domain.tld — ไม่มีช่องว่าง มี @ เดียว tld ≥ 2 ตัว
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(input);
}
