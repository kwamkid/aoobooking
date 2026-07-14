import Link from "next/link";
import { requireHotelMember } from "@/lib/auth";
import { hotelHref } from "@/lib/hotel/href";
import { createClient } from "@/lib/supabase/server";

type Prop = { id: string; name: string };
type RoomType = { id: string; name: string };
type InvRow = {
  room_type_id: string;
  date: string;
  total: number;
  booked: number;
  blocked: number;
};

// สีตามระดับความว่าง (available/total)
function cellClass(avail: number, total: number): string {
  if (total === 0) return "bg-neutral-100 text-neutral-400 dark:bg-neutral-800";
  if (avail <= 0) return "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300";
  const ratio = avail / total;
  if (ratio <= 0.25)
    return "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300";
  return "bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-300";
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ h?: string; p?: string; m?: string }>;
}) {
  const { h, p, m } = await searchParams;
  const { hotel } = await requireHotelMember(h);
  const supabase = await createClient();

  const { data: propsData } = await supabase
    .from("properties")
    .select("id, name")
    .eq("hotel_id", hotel.id)
    .is("deleted_at", null)
    .order("created_at");
  const properties = (propsData ?? []) as Prop[];

  if (properties.length === 0) {
    return (
      <div className="mx-auto max-w-5xl p-8">
        <h1 className="text-2xl font-bold">ปฏิทินห้องว่าง</h1>
        <p className="mt-4 text-neutral-500">
          ยังไม่มีสาขา —{" "}
          <Link href={hotelHref("/settings/properties", hotel.slug)} className="underline">
            เพิ่มสาขาก่อน
          </Link>
        </p>
      </div>
    );
  }

  const activeProp = properties.find((x) => x.id === p) ?? properties[0];

  // เดือนที่แสดง (m = 'YYYY-MM') — default เดือนปัจจุบัน
  const now = new Date();
  const [yy, mm] = m
    ? m.split("-").map(Number)
    : [now.getUTCFullYear(), now.getUTCMonth() + 1];
  const monthStart = new Date(Date.UTC(yy, mm - 1, 1));
  const monthEnd = new Date(Date.UTC(yy, mm, 0)); // วันสุดท้ายของเดือน
  const daysInMonth = monthEnd.getUTCDate();
  const from = monthStart.toISOString().slice(0, 10);
  const to = monthEnd.toISOString().slice(0, 10);

  const prevM = new Date(Date.UTC(yy, mm - 2, 1)).toISOString().slice(0, 7);
  const nextM = new Date(Date.UTC(yy, mm, 1)).toISOString().slice(0, 7);

  const [{ data: rtData }, { data: invData }] = await Promise.all([
    supabase
      .from("room_types")
      .select("id, name")
      .eq("property_id", activeProp.id)
      .is("deleted_at", null)
      .order("sort_order"),
    supabase
      .from("room_type_inventory")
      .select("room_type_id, date, total, booked, blocked")
      .eq("property_id", activeProp.id)
      .gte("date", from)
      .lte("date", to),
  ]);
  const roomTypes = (rtData ?? []) as RoomType[];
  const inv = (invData ?? []) as InvRow[];

  // index inventory: `${room_type_id}|${date}` → row
  const invMap = new Map(inv.map((r) => [`${r.room_type_id}|${r.date}`, r]));
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const monthLabel = monthStart.toLocaleDateString("th-TH", {
    year: "numeric",
    month: "long",
    timeZone: "UTC",
  });

  return (
    <div className="mx-auto max-w-6xl p-8">
      <h1 className="text-2xl font-bold">ปฏิทินห้องว่าง</h1>

      {/* property switcher + month nav */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {properties.map((pr) => (
          <Link
            key={pr.id}
            href={`${hotelHref("/calendar", hotel.slug)}&p=${pr.id}&m=${yy}-${String(mm).padStart(2, "0")}`}
            className={`rounded-full px-3 py-1 text-sm ${
              pr.id === activeProp.id
                ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                : "border border-neutral-300 dark:border-neutral-700"
            }`}
          >
            {pr.name}
          </Link>
        ))}
        <div className="ml-auto flex items-center gap-2 text-sm">
          <Link
            href={`${hotelHref("/calendar", hotel.slug)}&p=${activeProp.id}&m=${prevM}`}
            className="rounded border border-neutral-300 px-2 py-1 dark:border-neutral-700"
          >
            ←
          </Link>
          <span className="min-w-32 text-center font-medium">{monthLabel}</span>
          <Link
            href={`${hotelHref("/calendar", hotel.slug)}&p=${activeProp.id}&m=${nextM}`}
            className="rounded border border-neutral-300 px-2 py-1 dark:border-neutral-700"
          >
            →
          </Link>
        </div>
      </div>

      {roomTypes.length === 0 ? (
        <p className="mt-6 text-sm text-neutral-400">
          ยังไม่มีประเภทห้อง —{" "}
          <Link href={hotelHref("/rooms", hotel.slug)} className="underline">
            เพิ่มห้องก่อน
          </Link>
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="border-collapse text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-white p-2 text-left dark:bg-neutral-950">
                  ประเภทห้อง
                </th>
                {days.map((d) => (
                  <th key={d} className="w-9 p-1 text-center font-normal text-neutral-400">
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {roomTypes.map((rt) => (
                <tr key={rt.id}>
                  <td className="sticky left-0 z-10 whitespace-nowrap bg-white p-2 font-medium dark:bg-neutral-950">
                    {rt.name}
                  </td>
                  {days.map((d) => {
                    const date = `${yy}-${String(mm).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                    const row = invMap.get(`${rt.id}|${date}`);
                    const total = row?.total ?? 0;
                    const avail = row ? row.total - row.booked - row.blocked : 0;
                    return (
                      <td
                        key={d}
                        className={`border border-white text-center dark:border-neutral-950 ${cellClass(avail, total)}`}
                        title={
                          row
                            ? `${date}: ว่าง ${avail}/${total} (จอง ${row.booked}, ปิด ${row.blocked})`
                            : `${date}: ไม่มีข้อมูล inventory`
                        }
                      >
                        {row ? avail : "–"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-3 flex gap-3 text-xs text-neutral-500">
            <span className="flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded bg-green-50 dark:bg-green-950/30" />{" "}
              ว่าง
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded bg-amber-100 dark:bg-amber-950/40" />{" "}
              ใกล้เต็ม (≤25%)
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded bg-red-100 dark:bg-red-950/40" />{" "}
              เต็ม
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
