import Link from "next/link";
import { requireHotelMember } from "@/lib/auth";
import { canMany } from "@/lib/permission";
import { hotelHref } from "@/lib/hotel/href";
import { createClient } from "@/lib/supabase/server";
import { AppPage, FilterTabs, PageHeader, RoomBadge } from "@/components/ui";
import { CheckInButton } from "./checkin-button";
import { CheckoutButton } from "./checkout-button";

type Row = {
  id: string;
  code: string;
  status: string;
  check_in: string;
  check_out: string;
  guests: { full_name: string } | null;
  booking_rooms?: { room: { room_number: string } | null }[];
};
type Balance = { booking_id: string; balance_satang: number };

export default async function FrontDeskPage({
  params,
  searchParams,
}: {
  params: Promise<{ hotel: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { hotel: hotelSlug } = await params;
  const sp = await searchParams;
  const { hotel } = await requireHotelMember(hotelSlug);
  const supabase = await createClient();

  // สิทธิ์รับเงิน/ยืนยันสลิป/คืนเงิน — ใช้ใน checkout modal (รอบเดียวผ่าน canMany)
  const perms3 = await canMany(hotel.id, [
    "payments.charge",
    "payments.verify_slip",
    "payments.refund",
  ] as const);
  const canPayCharge = perms3["payments.charge"];
  const canPayVerify = perms3["payments.verify_slip"];
  const canPayRefund = perms3["payments.refund"];

  const today = new Date().toISOString().slice(0, 10);

  // 2 query พอ: เข้าวันนี้ (confirmed, check_in=today) + พักอยู่ (checked_in ทั้งหมด)
  // "ออกวันนี้" เป็น subset ของพักอยู่ (check_out=today) — กรองในโค้ด ไม่ยิงซ้ำ
  const [{ data: arrivals }, { data: inhouse }] = await Promise.all([
    supabase
      .from("bookings")
      .select("id, code, status, check_in, check_out, guests(full_name), booking_rooms(room:rooms(room_number))")
      .eq("hotel_id", hotel.id)
      .eq("status", "confirmed")
      .eq("check_in", today)
      .order("code"),
    supabase
      .from("bookings")
      .select("id, code, status, check_in, check_out, guests(full_name), booking_rooms(room:rooms(room_number))")
      .eq("hotel_id", hotel.id)
      .eq("status", "checked_in")
      .order("check_out"),
  ]);

  const arrivalRows = (arrivals ?? []) as unknown as Row[];
  const inhouseRows = (inhouse ?? []) as unknown as Row[];
  const departureRows = [...inhouseRows]
    .filter((b) => b.check_out === today)
    .sort((a, z) => a.code.localeCompare(z.code));

  // ยอดค้างของแขกที่พักอยู่ (ครอบ departures ด้วย — เป็น subset กัน)
  const balMap = new Map<string, number>();
  if (inhouseRows.length > 0) {
    const { data: bals } = await supabase
      .from("booking_balances")
      .select("booking_id, balance_satang")
      .in("booking_id", inhouseRows.map((b) => b.id));
    for (const b of (bals ?? []) as Balance[]) balMap.set(b.booking_id, b.balance_satang);
  }

  // tab แทน 3 section ซ้อนกัน (เจ้าของขอ 2026-07-23) — ?tab= ผ่าน FilterTabs
  // การ์ดเดียวกับหน้าการจอง · default = เข้าวันนี้ (งานแรกของกะเช้า)
  const tab = ["arrivals", "departures", "inhouse"].includes(sp.tab ?? "")
    ? (sp.tab as "arrivals" | "departures" | "inhouse")
    : "arrivals";

  return (
    <AppPage
        title="งานวันนี้"
        subtitle={`${hotel.name} · ${new Date(today).toLocaleDateString("th-TH")}`}>

      <FilterTabs
        activeId={tab}
        tabs={[
          { id: "arrivals", label: "เข้าวันนี้", count: arrivalRows.length, href: "?tab=arrivals", tone: "brand", always: true },
          { id: "departures", label: "ออกวันนี้", count: departureRows.length, href: "?tab=departures", tone: "warning", always: true },
          { id: "inhouse", label: "พักอยู่", count: inhouseRows.length, href: "?tab=inhouse", tone: "success", always: true },
        ]}
      />

      <div className="mt-4 space-y-2">
        {tab === "arrivals" &&
          (arrivalRows.length === 0 ? (
            <Empty>ไม่มีแขกเข้าวันนี้</Empty>
          ) : (
            arrivalRows.map((b) => (
              <RowItem key={b.id} b={b} hotelSlug={hotel.slug}>
                {/* เช็คอิน = เลือกเบอร์ห้องก่อน (จองผูกแค่ประเภทห้อง) */}
                <CheckInButton
                  hotelSlug={hotel.slug}
                  bookingId={b.id}
                  code={b.code}
                  guestName={b.guests?.full_name ?? null}
                />
              </RowItem>
            ))
          ))}

        {tab === "departures" &&
          (departureRows.length === 0 ? (
            <Empty>ไม่มีแขกออกวันนี้</Empty>
          ) : (
            departureRows.map((b) => {
              const bal = balMap.get(b.id) ?? 0;
              return (
                <RowItem key={b.id} b={b} balance={bal} hotelSlug={hotel.slug}>
                  {/* checkout modal: สรุปบิล + เก็บเงินยอดค้าง + เช็คเอาท์จบที่เดียว */}
                  <CheckoutButton
                    hotelSlug={hotel.slug}
                    bookingId={b.id}
                    code={b.code}
                    guestName={b.guests?.full_name ?? null}
                    balanceSatang={bal}
                    perms={{ charge: canPayCharge, verify: canPayVerify, refund: canPayRefund }}
                  />
                </RowItem>
              );
            })
          ))}

        {tab === "inhouse" &&
          (inhouseRows.length === 0 ? (
            <Empty>ไม่มีแขกพักอยู่</Empty>
          ) : (
            inhouseRows.map((b) => (
              <RowItem key={b.id} b={b} balance={balMap.get(b.id) ?? 0} hotelSlug={hotel.slug} />
            ))
          ))}
      </div>
    </AppPage>
  );
}

function RowItem({
  b,
  balance,
  hotelSlug,
  children,
}: {
  b: Row;
  balance?: number;
  hotelSlug: string;
  children?: React.ReactNode;
}) {
  const roomNos = (b.booking_rooms ?? [])
    .map((r) => r.room?.room_number)
    .filter((n): n is string => !!n);
  return (
    <div className="flex items-center justify-between rounded-lg border border-border p-3 text-sm">
      <div>
        {/* เบอร์ห้องเด่นสุด — front desk มองหาห้องเป็นหลัก (มีเมื่อ assign แล้ว) */}
        {roomNos.length > 0 && (
          <span className="mr-2">
            <RoomBadge rooms={roomNos} size="sm" />
          </span>
        )}
        <span className="font-mono">{b.code}</span>
        {/* ชื่อแขก = ลิงก์เข้ารายละเอียดการจอง (ดู folio/รับเงิน/ประวัติ) */}
        <Link
          href={hotelHref(`/bookings/${b.id}`, hotelSlug)}
          className="ml-2 font-medium underline-offset-2 hover:text-info-strong hover:underline"
        >
          {b.guests?.full_name ?? "-"}
        </Link>
        <span className="ml-2 text-xs text-fg-muted">
          {b.check_in} → {b.check_out}
        </span>
        {balance != null && balance > 0 && (
          <span className="ml-2 text-sm font-medium text-danger-strong">
            ค้าง {(balance / 100).toLocaleString()}฿
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-fg-subtle">{children}</p>;
}
