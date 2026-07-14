import Link from "next/link";
import { notFound } from "next/navigation";
import { requireHotelMember } from "@/lib/auth";
import { can } from "@/lib/permission";
import { hotelHref } from "@/lib/hotel/href";
import { createClient } from "@/lib/supabase/server";
import { Card, EmptyState } from "@/components/ui";
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
}: {
  params: Promise<{ hotel: string; id: string }>;
}) {
  const { hotel: hotelSlug, id } = await params;
  const { hotel } = await requireHotelMember(hotelSlug);
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
    <div className="p-4 sm:p-8">
      <Link href={hotelHref("/guests", hotel.slug)} className="text-sm text-fg-muted underline">
        ← แขก
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-fg">{guest.full_name}</h1>
      <p className="mt-1 text-sm text-fg-muted">
        {guest.phone ?? "-"} · {guest.email ?? "-"} · {guest.nationality ?? "-"}
      </p>
      <p className="mt-1 text-xs">
        {guest.pdpa_consent_at ? (
          <span className="text-success">
            ✓ ยินยอม PDPA เมื่อ {new Date(guest.pdpa_consent_at).toLocaleDateString("th-TH")}
          </span>
        ) : (
          <span className="text-warning">ยังไม่ได้ให้ความยินยอม PDPA</span>
        )}
      </p>

      {/* ID + PDPA (เฉพาะคนมีสิทธิ์ view_id) */}
      {canViewId ? (
        <Card className="mt-6">
          <h2 className="mb-3 text-lg font-semibold text-fg">เอกสารระบุตัวตน (PDPA)</h2>
          <GuestIdForm
            hotelSlug={hotel.slug}
            guestId={guest.id}
            idType={sensitive?.id_type ?? ""}
            idNumber={sensitive?.id_number ?? ""}
            hasConsent={!!guest.pdpa_consent_at}
            canEdit={canEdit}
          />
        </Card>
      ) : (
        <Card className="mt-6 text-sm text-fg-muted">
          คุณไม่มีสิทธิ์ดูข้อมูลบัตร/passport ของแขก (ต้องมีสิทธิ์ guests.view_id)
        </Card>
      )}

      {/* ประวัติการพัก */}
      <section className="mt-6">
        <h2 className="mb-2 text-lg font-semibold text-fg">ประวัติการพัก ({stays.length})</h2>
        {stays.length === 0 ? (
          <EmptyState art="calendar" title="ยังไม่มีประวัติ" />
        ) : (
          <ul className="space-y-1 text-sm">
            {stays.map((s) => (
              <li
                key={s.id}
                className="flex justify-between rounded border border-border px-3 py-1.5"
              >
                <span>
                  <span className="font-mono">{s.code}</span> · {s.check_in} → {s.check_out}
                </span>
                <span className="text-fg-muted">
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
