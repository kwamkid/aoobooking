/* โลโก้ธนาคารไทย — SVG จาก omise/banks-logo (MIT, public/banks/*.svg เป็นลายขาว)
 * วางบนวงกลมสีแบรนด์ทางการของแต่ละธนาคาร · ไม่มีโลโก้ (อื่นๆ) = วงกลม ฿ */

import { bankOf } from "@/lib/payment/banks";

export function BankLogo({ code, size = 28 }: { code?: string; size?: number }) {
  const bank = bankOf(code);
  // สี/ขนาดมาจาก data ธนาคาร (runtime) — inline style จำเป็น (rules #15 ข้อยกเว้น)
  const box = { width: size, height: size };
  if (!bank?.logo) {
    return (
      <span
        className="inline-flex shrink-0 items-center justify-center rounded-full bg-border-strong font-medium text-bg"
        style={{ ...box, fontSize: size * 0.5 }}
        aria-hidden
      >
        ฿
      </span>
    );
  }
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full"
      style={{ ...box, backgroundColor: bank.color }}
      title={bank.name}
    >
      {/* svg เล็กจาก public — ไม่ต้องผ่าน next/image optimizer */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/banks/${bank.logo}.svg`}
        alt={bank.name}
        style={{ width: size * 0.62, height: size * 0.62 }}
      />
    </span>
  );
}
