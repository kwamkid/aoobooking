import Link from "next/link";
import { requireHotelMember } from "@/lib/auth";
import { can } from "@/lib/permission";
import { hotelHref } from "@/lib/hotel/href";
import { createClient } from "@/lib/supabase/server";

type Booking = {
  id: string;
  code: string;
  status: string;
  check_in: string;
  check_out: string;
  total_satang: number;
  guests: { full_name: string } | null;
};

const STATUS_COLOR: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  confirmed: "bg-blue-100 text-blue-700",
  checked_in: "bg-green-100 text-green-700",
  checked_out: "bg-neutral-200 text-neutral-700",
  cancelled: "bg-red-100 text-red-700",
  no_show: "bg-red-100 text-red-700",
};

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ h?: string }>;
}) {
  const { h } = await searchParams;
  const { hotel } = await requireHotelMember(h);
  const canCreate = await can(hotel.id, "bookings.create");
  const supabase = await createClient();

  const { data } = await supabase
    .from("bookings")
    .select("id, code, status, check_in, check_out, total_satang, guests(full_name)")
    .eq("hotel_id", hotel.id)
    .order("created_at", { ascending: false })
    .limit(50);
  const bookings = (data ?? []) as unknown as Booking[];

  return (
    <div className="mx-auto max-w-4xl p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">การจอง</h1>
        {canCreate && (
          <Link
            href={hotelHref("/bookings/new", hotel.slug)}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-neutral-900"
          >
            + จองใหม่
          </Link>
        )}
      </div>

      {bookings.length === 0 ? (
        <p className="mt-8 text-neutral-400">ยังไม่มีการจอง</p>
      ) : (
        <table className="mt-6 w-full text-sm">
          <thead className="text-left text-neutral-500">
            <tr className="border-b border-neutral-200 dark:border-neutral-800">
              <th className="py-2">โค้ด</th>
              <th>แขก</th>
              <th>เข้า–ออก</th>
              <th>สถานะ</th>
              <th className="text-right">ยอด</th>
            </tr>
          </thead>
          <tbody>
            {bookings.map((b) => (
              <tr
                key={b.id}
                className="border-b border-neutral-100 dark:border-neutral-900"
              >
                <td className="py-2 font-mono">{b.code}</td>
                <td>{b.guests?.full_name ?? "-"}</td>
                <td className="text-neutral-500">
                  {b.check_in} → {b.check_out}
                </td>
                <td>
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${
                      STATUS_COLOR[b.status] ?? "bg-neutral-100"
                    }`}
                  >
                    {b.status}
                  </span>
                </td>
                <td className="text-right font-medium">
                  {(b.total_satang / 100).toLocaleString()}฿
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
