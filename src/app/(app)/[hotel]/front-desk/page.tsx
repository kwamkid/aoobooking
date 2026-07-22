import Link from "next/link";
import { requireHotelMember } from "@/lib/auth";
import { can } from "@/lib/permission";
import { hotelHref } from "@/lib/hotel/href";
import { createClient } from "@/lib/supabase/server";
import { AppPage, PageHeader, RoomBadge } from "@/components/ui";
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
}: {
  params: Promise<{ hotel: string }>;
}) {
  const { hotel: hotelSlug } = await params;
  const { hotel } = await requireHotelMember(hotelSlug);
  const supabase = await createClient();

  // สิทธิ์รับเงิน/ยืนยันสลิป — ใช้ใน checkout modal (เก็บเงิน & เช็คเอาท์)
  const [canPayCharge, canPayVerify] = await Promise.all([
    can(hotel.id, "payments.charge"),
    can(hotel.id, "payments.verify_slip"),
  ]);

  const today = new Date().toISOString().slice(0, 10);

  // 3 กลุ่ม: เข้าวันนี้ (confirmed, check_in=today) / ออกวันนี้ (checked_in, check_out=today) / in-house
  const [{ data: arrivals }, { data: departures }, { data: inhouse }] = await Promise.all([
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
      .eq("check_out", today)
      .order("code"),
    supabase
      .from("bookings")
      .select("id, code, status, check_in, check_out, guests(full_name), booking_rooms(room:rooms(room_number))")
      .eq("hotel_id", hotel.id)
      .eq("status", "checked_in")
      .order("check_out"),
  ]);

  // ยอดค้างของ departures + in-house (เพื่อโชว้แดงถ้าค้าง)
  const ids = [...(departures ?? []), ...(inhouse ?? [])].map((b) => b.id);
  const balMap = new Map<string, number>();
  if (ids.length > 0) {
    const { data: bals } = await supabase
      .from("booking_balances")
      .select("booking_id, balance_satang")
      .in("booking_id", ids);
    for (const b of (bals ?? []) as Balance[]) balMap.set(b.booking_id, b.balance_satang);
  }

  const arrivalRows = (arrivals ?? []) as unknown as Row[];
  const departureRows = (departures ?? []) as unknown as Row[];
  const inhouseRows = (inhouse ?? []) as unknown as Row[];

  return (
    <AppPage
        title="งานวันนี้"
        subtitle={`${hotel.name} · ${new Date(today).toLocaleDateString("th-TH")}`}>

      {/* เข้าวันนี้ */}
      <Section title={`เข้าวันนี้ (${arrivalRows.length})`}>
        {arrivalRows.length === 0 ? (
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
        )}
      </Section>

      {/* ออกวันนี้ */}
      <Section title={`ออกวันนี้ (${departureRows.length})`}>
        {departureRows.length === 0 ? (
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
                  perms={{ charge: canPayCharge, verify: canPayVerify }}
                />
              </RowItem>
            );
          })
        )}
      </Section>

      {/* พักอยู่ */}
      <Section title={`พักอยู่ (${inhouseRows.length})`}>
        {inhouseRows.length === 0 ? (
          <Empty>ไม่มีแขกพักอยู่</Empty>
        ) : (
          inhouseRows.map((b) => (
            <RowItem key={b.id} b={b} balance={balMap.get(b.id) ?? 0} hotelSlug={hotel.slug} />
          ))
        )}
      </Section>
    </AppPage>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-2 text-lg font-semibold text-fg">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
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
