/* รายชื่อธนาคารไทย — ใช้ในฟอร์มบัญชีรับเงิน (ตั้งค่า > ช่องทางชำระเงิน)
 * logo: SVG จาก omise/banks-logo (MIT) เก็บไว้ที่ public/banks/*.svg
 * color: สีแบรนด์ทางการจาก banks.json ของ repo เดียวกัน (ใช้เป็นพื้นวงกลมโลโก้) */

export const THAI_BANKS: { code: string; name: string; logo?: string; color?: string }[] = [
  { code: "KBANK", name: "กสิกรไทย", logo: "kbank", color: "#138f2d" },
  { code: "SCB", name: "ไทยพาณิชย์", logo: "scb", color: "#4e2e7f" },
  { code: "BBL", name: "กรุงเทพ", logo: "bbl", color: "#1e4598" },
  { code: "KTB", name: "กรุงไทย", logo: "ktb", color: "#1ba5e1" },
  { code: "BAY", name: "กรุงศรีอยุธยา", logo: "bay", color: "#fec43b" },
  { code: "TTB", name: "ทีเอ็มบีธนชาต (ttb)", logo: "ttb", color: "#ecf0f1" },
  { code: "GSB", name: "ออมสิน", logo: "gsb", color: "#eb198d" },
  { code: "BAAC", name: "ธ.ก.ส.", logo: "baac", color: "#4b9b1d" },
  { code: "GHB", name: "อาคารสงเคราะห์", logo: "ghb", color: "#f57d23" },
  { code: "UOB", name: "ยูโอบี", logo: "uob", color: "#0b3979" },
  { code: "CIMB", name: "ซีไอเอ็มบี ไทย", logo: "cimb", color: "#7e2f36" },
  { code: "LH", name: "แลนด์ แอนด์ เฮ้าส์", logo: "lhb", color: "#6d6e71" },
  { code: "KKP", name: "เกียรตินาคินภัทร", logo: "kk", color: "#199cc5" },
  { code: "TISCO", name: "ทิสโก้", logo: "tisco", color: "#12549f" },
  { code: "ISBT", name: "อิสลามแห่งประเทศไทย", logo: "ibank", color: "#184615" },
  { code: "OTHER", name: "อื่นๆ" },
];

export function bankOf(code: string | undefined) {
  return THAI_BANKS.find((b) => b.code === code);
}

export function bankName(code: string | undefined): string {
  return bankOf(code)?.name ?? code ?? "";
}
