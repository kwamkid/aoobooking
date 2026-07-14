import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hotelHref } from "@/lib/hotel/href";
import { CreateHotelForm } from "./create-hotel-form";

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
      role: m.role,
      hotel: m.hotels as unknown as { slug: string; name: string } | null,
    }))
    .filter((m) => m.hotel);

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-8 p-8">
      <div>
        <h1 className="text-2xl font-bold">โรงแรมของคุณ</h1>
        <p className="text-neutral-500">เลือกโรงแรม หรือสร้างใหม่</p>
      </div>

      {hotels.length > 0 && (
        <ul className="flex flex-col gap-2">
          {hotels.map(({ hotel, role }) => (
            <li key={hotel!.slug}>
              <Link
                href={hotelHref("/dashboard", hotel!.slug)}
                className="flex items-center justify-between rounded-lg border border-neutral-200 px-4 py-3 transition hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900"
              >
                <span className="font-medium">{hotel!.name}</span>
                <span className="text-xs text-neutral-400">{role}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="border-t border-neutral-200 pt-6 dark:border-neutral-800">
        <h2 className="mb-3 text-sm font-semibold text-neutral-500">
          สร้างโรงแรมใหม่
        </h2>
        <CreateHotelForm />
      </div>
    </main>
  );
}
