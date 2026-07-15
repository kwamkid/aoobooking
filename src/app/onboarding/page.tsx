import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hotelHref } from "@/lib/hotel/href";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { HeroSlider } from "./hero-slider";
import { CreateHotelButton } from "./create-hotel-button";

export default async function OnboardingPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: memberships } = await supabase
    .from("hotel_members")
    .select("role, hotels(slug, name)")
    .eq("user_id", user.id);

  const hotels = (memberships ?? [])
    .map((m) => ({
      role: m.role as string,
      hotel: m.hotels as unknown as { slug: string; name: string } | null,
    }))
    .filter((m) => m.hotel !== null) as {
    role: string;
    hotel: { slug: string; name: string };
  }[];

  return (
    <div className="flex min-h-dvh w-full bg-bg">
      {/* ── ซ้าย: slider รูปโรงแรม (ซ่อนบนมือถือ) ── */}
      <div className="hidden lg:block lg:w-1/2 xl:w-3/5">
        <HeroSlider />
      </div>

      {/* ── ขวา: เลือก/สร้างโรงแรม ── */}
      <div className="flex w-full items-center justify-center bg-bg-subtle p-6 sm:p-8 lg:w-1/2 lg:p-12 xl:w-2/5">
        <div className="w-full max-w-md">
          {/* logo บนมือถือ */}
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

          <h1 className="text-2xl font-bold text-fg">โรงแรมของคุณ</h1>
          <p className="mt-1 text-sm text-fg-muted">
            {hotels.length > 0
              ? "เลือกโรงแรมที่จะเข้าจัดการ"
              : "เริ่มต้นด้วยการสร้างโรงแรมแรกของคุณ"}
          </p>

          {hotels.length > 0 && (
            <ul className="mt-6 flex flex-col gap-2">
              {hotels.map(({ hotel, role }) => (
                <li key={hotel.slug}>
                  <Link
                    href={hotelHref("/dashboard", hotel.slug)}
                    className="group flex items-center gap-3 rounded-lg border border-border bg-bg-elevated p-3 transition hover:border-brand hover:shadow-(--shadow-sm)"
                  >
                    <HotelAvatar name={hotel.name} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-fg">
                        {hotel.name}
                      </span>
                      <span className="block truncate text-sm text-fg-subtle">
                        aoobooking.com/{hotel.slug}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-fg-subtle">{role}</span>
                    <ChevronRight
                      size={16}
                      className="shrink-0 text-fg-subtle transition group-hover:translate-x-0.5 group-hover:text-brand"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <div className={hotels.length > 0 ? "mt-6 border-t border-border pt-6" : "mt-6"}>
            <CreateHotelButton hasHotels={hotels.length > 0} />
          </div>
        </div>
      </div>
    </div>
  );
}

// โลโก้โรงแรม — ยังไม่มีฟีเจอร์อัพโลโก้ → fallback ตัวอักษรแรก
function HotelAvatar({ name }: { name: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-(--radius) bg-brand-soft text-lg font-bold text-brand">
      {initial}
    </span>
  );
}
