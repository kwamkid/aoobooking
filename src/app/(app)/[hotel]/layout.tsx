import { Suspense } from "react";
import { requireHotelMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "../app-shell";

// [hotel] layout — resolve hotel จาก path segment + guard membership + โหลด AppShell chrome
// URL: /abchotel/dashboard → params.hotel = "abchotel"
export default async function HotelLayout({
  params,
  children,
}: {
  params: Promise<{ hotel: string }>;
  children: React.ReactNode;
}) {
  const { hotel: hotelSlug } = await params;
  const { hotel, user } = await requireHotelMember(hotelSlug);

  const supabase = await createClient();

  // profile (top bar) + โรงแรมทั้งหมดที่เป็นสมาชิก (account switcher)
  const [{ data: profile }, { data: memberships }] = await Promise.all([
    supabase.from("profiles").select("full_name, email").eq("id", user.id).single(),
    supabase
      .from("hotel_members")
      .select("role, hotels(slug, name)")
      .eq("user_id", user.id),
  ]);
  const p = profile as { full_name: string | null; email: string | null } | null;

  const hotels = (memberships ?? [])
    .map((m) => m.hotels as unknown as { slug: string; name: string } | null)
    .filter((h): h is { slug: string; name: string } => !!h);

  return (
    <Suspense>
      <AppShell
        user={{ name: p?.full_name ?? "", email: p?.email ?? user.email ?? "" }}
        activeHotel={{ slug: hotel.slug, name: hotel.name }}
        hotels={hotels}
      >
        {children}
      </AppShell>
    </Suspense>
  );
}
