/* PromptPay QR payload — Thai QR Payment Standard (EMVCo)
 * ใช้สร้าง QR ให้แขกสแกนจ่ายเข้าบัญชีโรงแรมโดยตรง (เราไม่จับเงิน — BLUEPRINT §21.3)
 * อ้างอิงโครง tag: 00 เวอร์ชัน · 01 static/dynamic · 29 merchant (AID+PromptPay ID)
 * · 53 สกุลเงิน (764=THB) · 54 ยอด · 58 ประเทศ · 63 CRC16-CCITT(FALSE) */

function tlv(tag: string, value: string): string {
  return tag + String(value.length).padStart(2, "0") + value;
}

// CRC16-CCITT (FALSE): poly 0x1021, init 0xFFFF — คิดรวม "6304" ท้าย payload
function crc16(input: string): string {
  let crc = 0xffff;
  for (let i = 0; i < input.length; i++) {
    crc ^= input.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export type PromptPayIdType = "phone" | "citizen_id";

/** แปลง PromptPay ID เป็นรูปแบบใน payload — เบอร์มือถือ: 0066 + ตัด 0 นำ (13 หลัก) */
function formatId(idType: PromptPayIdType, idValue: string): string {
  const digits = idValue.replace(/\D/g, "");
  if (idType === "phone") return "0066" + digits.replace(/^0/, "");
  return digits; // เลขบัตรประชาชน 13 หลักใช้ตรงๆ
}

export function promptPayPayload(input: {
  idType: PromptPayIdType;
  idValue: string;
  /** ยอดเงิน (satang) — ใส่ = QR แบบ dynamic ระบุยอด · ไม่ใส่ = static ให้กรอกเอง */
  amountSatang?: number;
}): string {
  const merchant =
    tlv("00", "A000000677010111") +
    tlv(input.idType === "phone" ? "01" : "02", formatId(input.idType, input.idValue));

  // ลำดับ tag ตาม promptpay-qr (ธนาคารไทยทุกแอปสแกนได้): 58 ประเทศ → 53 สกุล → 54 ยอด
  let payload =
    tlv("00", "01") +
    tlv("01", input.amountSatang ? "12" : "11") +
    tlv("29", merchant) +
    tlv("58", "TH") +
    tlv("53", "764");
  if (input.amountSatang && input.amountSatang > 0) {
    payload += tlv("54", (input.amountSatang / 100).toFixed(2));
  }
  payload += "6304";
  return payload + crc16(payload);
}
