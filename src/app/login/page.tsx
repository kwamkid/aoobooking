import { getTranslations } from "next-intl/server";
import { CalendarDays, BedDouble, Users, BarChart3 } from "lucide-react";
import { LoginForm } from "./login-form";

const FEATURES = [
  { Icon: CalendarDays, title: "ปฏิทิน & การจอง", desc: "จัดการห้องว่างและรับจองครบวงจร" },
  { Icon: BedDouble, title: "ห้องพัก & ราคา", desc: "ตั้งราคาตามฤดูกาล คุมห้องไม่ให้ overbook" },
  { Icon: Users, title: "หน้าเคาน์เตอร์", desc: "เช็คอิน/เอาท์ + folio + รับชำระเงิน" },
  { Icon: BarChart3, title: "รายงาน", desc: "รายได้ occupancy แยกช่องทางชำระ" },
];

export default async function LoginPage() {
  const t = await getTranslations("app");

  return (
    <div className="flex min-h-dvh w-full bg-bg">
      {/* ── ซ้าย: hero (ซ่อนบนมือถือ) ── */}
      <div className="relative hidden overflow-hidden bg-brand lg:flex lg:w-1/2 xl:w-3/5">
        {/* วงกลมตกแต่งจางๆ */}
        <div className="pointer-events-none absolute inset-0 opacity-10">
          <div className="absolute -left-1/4 -top-1/4 h-96 w-96 rounded-full bg-white" />
          <div className="absolute -bottom-1/4 -right-1/4 h-125 w-125 rounded-full bg-white" />
        </div>

        <div className="relative z-10 flex flex-col justify-center px-12 text-brand-fg xl:px-20">
          <div className="mb-8 flex items-center gap-3">
            {/* logo สีขาวบนพื้น brand — filter invert (ไม่มีกรอบ) */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/aoobooking-logo.svg"
              alt="AooBooking"
              width={48}
              height={48}
              className="h-12 w-12 brightness-0 invert"
            />
            <span className="text-2xl font-bold">AooBooking</span>
          </div>

          <h1 className="mb-4 text-4xl font-bold leading-tight xl:text-5xl">
            ระบบจองโรงแรม
            <br />+ จัดการหลังบ้าน
          </h1>
          <p className="mb-12 max-w-md text-lg text-brand-fg/80">
            จัดการทุกอย่างในที่เดียว ตั้งแต่รับจอง เช็คอิน ราคา ห้องพัก ไปจนถึงรายงาน
          </p>

          <div className="grid max-w-lg grid-cols-2 gap-6">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex items-start gap-3">
                <div className="rounded-(--radius) bg-white/20 p-2">
                  <f.Icon className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">{f.title}</h3>
                  <p className="text-xs text-brand-fg/70">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── ขวา: login card ── */}
      <div className="flex w-full items-center justify-center bg-bg-subtle p-6 sm:p-8 lg:w-1/2 lg:p-12 xl:w-2/5">
        <div className="w-full max-w-md">
          {/* logo บนมือถือ (hero ซ่อน) */}
          <div className="mb-8 flex items-center justify-center gap-2 lg:hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/aoobooking-logo.svg"
              alt="AooBooking"
              width={40}
              height={40}
              className="h-10 w-10"
            />
            <span className="text-xl font-bold text-brand">AooBooking</span>
          </div>

          <div className="rounded-lg border border-border bg-bg-elevated p-6 shadow-lg sm:p-8">
            <h2 className="text-center text-2xl font-bold text-fg">ยินดีต้อนรับ</h2>
            <p className="mt-1 text-center text-sm text-fg-muted">
              เข้าสู่ระบบเพื่อจัดการโรงแรมของคุณ
            </p>
            <div className="mt-6">
              <LoginForm />
            </div>
          </div>

          <p className="mt-8 text-center text-sm text-fg-subtle">
            {t("name")} · {t("tagline")}
          </p>
        </div>
      </div>
    </div>
  );
}
