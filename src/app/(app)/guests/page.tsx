import Link from "next/link";
import { requireHotelMember } from "@/lib/auth";
import { hotelHref } from "@/lib/hotel/href";
import { createClient } from "@/lib/supabase/server";

type GuestSafe = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  nationality: string | null;
  pdpa_consent_at: string | null;
};

export default async function GuestsPage({
  searchParams,
}: {
  searchParams: Promise<{ h?: string; q?: string }>;
}) {
  const { h, q } = await searchParams;
  const { hotel } = await requireHotelMember(h);
  const supabase = await createClient();

  // ใช้ guests_safe view (ไม่มี id_number/id_photo_path) สำหรับ list
  let query = supabase
    .from("guests_safe")
    .select("id, full_name, phone, email, nationality, pdpa_consent_at")
    .eq("hotel_id", hotel.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (q?.trim()) {
    const term = `%${q.trim()}%`;
    query = query.or(`full_name.ilike.${term},phone.ilike.${term},email.ilike.${term}`);
  }

  const { data } = await query;
  const guests = (data ?? []) as unknown as GuestSafe[];

  return (
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="text-2xl font-bold">แขก</h1>

      <form className="mt-4" action={hotelHref("/guests", hotel.slug).split("?")[0]}>
        <input type="hidden" name="h" value={hotel.slug} />
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="ค้นชื่อ / เบอร์ / อีเมล"
          className="w-full max-w-sm rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
      </form>

      {guests.length === 0 ? (
        <p className="mt-8 text-neutral-400">
          {q ? "ไม่พบแขกที่ค้นหา" : "ยังไม่มีแขก (จะถูกสร้างเมื่อมีการจอง)"}
        </p>
      ) : (
        <table className="mt-6 w-full text-sm">
          <thead className="text-left text-neutral-500">
            <tr className="border-b border-neutral-200 dark:border-neutral-800">
              <th className="py-2">ชื่อ</th>
              <th>ติดต่อ</th>
              <th>สัญชาติ</th>
              <th>PDPA</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {guests.map((g) => (
              <tr key={g.id} className="border-b border-neutral-100 dark:border-neutral-900">
                <td className="py-2 font-medium">{g.full_name}</td>
                <td className="text-neutral-500">
                  {g.phone ?? ""}
                  {g.phone && g.email ? " · " : ""}
                  {g.email ?? ""}
                </td>
                <td className="text-neutral-500">{g.nationality ?? "-"}</td>
                <td>
                  {g.pdpa_consent_at ? (
                    <span className="text-xs text-green-600">✓ ยินยอม</span>
                  ) : (
                    <span className="text-xs text-neutral-400">—</span>
                  )}
                </td>
                <td className="text-right">
                  <Link
                    href={hotelHref(`/guests/${g.id}`, hotel.slug)}
                    className="text-xs underline"
                  >
                    รายละเอียด
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
