import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hotelHref } from "@/lib/hotel/href";
import Link from "next/link";
import { CreateHotelButton } from "./create-hotel-button";

export default async function OnboardingPage() {
  const user = await requireUser();
  const supabase = await createClient();

  // hotels ที่ user เป็นสมาชิก (RLS กรองให้แล้ว)
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
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6 bg-bg p-6">
      <div className="flex flex-col items-center text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/aoobooking-logo.svg" alt="" className="mb-3 h-14 w-14" />
        <h1 className="text-2xl font-bold text-fg">โรงแรมของคุณ</h1>
        <p className="text-fg-muted">
          {hotels.length > 0 ? "เลือกโรงแรมที่จะเข้าจัดการ" : "เริ่มต้นด้วยการสร้างโรงแรมแรก"}
        </p>
      </div>

      {hotels.length > 0 && (
        <ul className="flex flex-col gap-2">
          {hotels.map(({ hotel, role }) => (
            <li key={hotel.slug}>
              <Link
                href={hotelHref("/dashboard", hotel.slug)}
                className="flex items-center gap-3 rounded-lg border border-border bg-bg-elevated p-3 transition hover:border-border-strong hover:bg-bg-subtle"
              >
                <HotelAvatar name={hotel.name} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-fg">{hotel.name}</div>
                  <div className="truncate font-mono text-xs text-fg-subtle">
                    /{hotel.slug}
                  </div>
                </div>
                <span className="shrink-0 text-xs text-fg-subtle">{role}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className={hotels.length > 0 ? "border-t border-border pt-4" : ""}>
        <CreateHotelButton hasHotels={hotels.length > 0} />
      </div>
    </main>
  );
}

// โลโก้โรงแรม — ยังไม่มีฟีเจอร์อัพโลโก้ → fallback เป็นตัวอักษรแรก (วงกลม brand-soft)
function HotelAvatar({ name }: { name: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-(--radius) bg-brand-soft text-lg font-bold text-brand">
      {initial}
    </div>
  );
}
