import Link from "next/link";
import { notFound } from "next/navigation";
import { requireHotelMember } from "@/lib/auth";
import { can } from "@/lib/permission";
import { hotelHref } from "@/lib/hotel/href";
import { createClient } from "@/lib/supabase/server";
import { GuestIdForm } from "./id-form";

type Stay = {
  id: string;
  code: string;
  status: string;
  check_in: string;
  check_out: string;
  total_satang: number;
};

export default async function GuestDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ h?: string }>;
}) {
  const { id } = await params;
  const { h } = await searchParams;
  const { hotel } = await requireHotelMember(h);
  const canViewId = await can(hotel.id, "guests.view_id");
  const canEdit = await can(hotel.id, "guests.edit");
  const supabase = await createClient();

  // ข้อมูลพื้นฐานจาก view ปลอดภัย
  const { data: safe } = await supabase
    .from("guests_safe")
    .select("id, full_name, phone, email, nationality, pdpa_consent_at")
    .eq("id", id)
    .eq("hotel_id", hotel.id)
    .single();
  if (!safe) notFound();
  const guest = safe as {
    id: string;
    full_name: string;
    phone: string | null;
    email: string | null;
    nationality: string | null;
    pdpa_consent_at: string | null;
  };

  // ข้อมูล ID อ่อนไหว — query เฉพาะเมื่อมีสิทธิ์ view_id (§20.1)
  let sensitive: { id_type: string | null; id_number: string | null } | null = null;
  if (canViewId) {
    const { data } = await supabase
      .from("guests")
      .select("id_type, id_number")
      .eq("id", id)
      .eq("hotel_id", hotel.id)
      .single();
    sensitive = data as unknown as { id_type: string | null; id_number: string | null } | null;
  }

  // ประวัติการพัก
  const { data: staysData } = await supabase
    .from("bookings")
    .select("id, code, status, check_in, check_out, total_satang")
    .eq("guest_id", id)
    .order("check_in", { ascending: false });
  const stays = (staysData ?? []) as unknown as Stay[];

  return (
    <div className="mx-auto max-w-3xl p-8">
      <Link href={hotelHref("/guests", hotel.slug)} className="text-sm text-neutral-500 underline">
        ← แขก
      </Link>
      <h1 className="mt-2 text-2xl font-bold">{guest.full_name}</h1>
      <p className="mt-1 text-sm text-neutral-500">
        {guest.phone ?? "-"} · {guest.email ?? "-"} · {guest.nationality ?? "-"}
      </p>
      <p className="mt-1 text-xs">
        {guest.pdpa_consent_at ? (
          <span className="text-green-600">
            ✓ ยินยอม PDPA เมื่อ {new Date(guest.pdpa_consent_at).toLocaleDateString("th-TH")}
          </span>
        ) : (
          <span className="text-amber-600">ยังไม่ได้ให้ความยินยอม PDPA</span>
        )}
      </p>

      {/* ID + PDPA (เฉพาะคนมีสิทธิ์ view_id) */}
      {canViewId ? (
        <section className="mt-6 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <h2 className="mb-3 text-lg font-semibold">เอกสารระบุตัวตน (PDPA)</h2>
          <GuestIdForm
            hotelSlug={hotel.slug}
            guestId={guest.id}
            idType={sensitive?.id_type ?? ""}
            idNumber={sensitive?.id_number ?? ""}
            hasConsent={!!guest.pdpa_consent_at}
            canEdit={canEdit}
          />
        </section>
      ) : (
        <p className="mt-6 rounded-lg bg-neutral-50 p-4 text-sm text-neutral-500 dark:bg-neutral-900/50">
          คุณไม่มีสิทธิ์ดูข้อมูลบัตร/passport ของแขก (ต้องมีสิทธิ์ guests.view_id)
        </p>
      )}

      {/* ประวัติการพัก */}
      <section className="mt-6">
        <h2 className="mb-2 text-lg font-semibold">ประวัติการพัก ({stays.length})</h2>
        {stays.length === 0 ? (
          <p className="text-sm text-neutral-400">ยังไม่มีประวัติ</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {stays.map((s) => (
              <li
                key={s.id}
                className="flex justify-between rounded border border-neutral-200 px-3 py-1.5 dark:border-neutral-800"
              >
                <span>
                  <span className="font-mono">{s.code}</span> · {s.check_in} → {s.check_out}
                </span>
                <span className="text-neutral-500">
                  {s.status} · {(s.total_satang / 100).toLocaleString()}฿
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
