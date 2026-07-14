import { requireHotelMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { ActionButton } from "./action-button";
import { checkInBooking, checkOutBooking } from "./actions";

type Row = {
  id: string;
  code: string;
  status: string;
  check_in: string;
  check_out: string;
  guests: { full_name: string } | null;
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

  const today = new Date().toISOString().slice(0, 10);

  // 3 กลุ่ม: เข้าวันนี้ (confirmed, check_in=today) / ออกวันนี้ (checked_in, check_out=today) / in-house
  const [{ data: arrivals }, { data: departures }, { data: inhouse }] = await Promise.all([
    supabase
      .from("bookings")
      .select("id, code, status, check_in, check_out, guests(full_name)")
      .eq("hotel_id", hotel.id)
      .eq("status", "confirmed")
      .eq("check_in", today)
      .order("code"),
    supabase
      .from("bookings")
      .select("id, code, status, check_in, check_out, guests(full_name)")
      .eq("hotel_id", hotel.id)
      .eq("status", "checked_in")
      .eq("check_out", today)
      .order("code"),
    supabase
      .from("bookings")
      .select("id, code, status, check_in, check_out, guests(full_name)")
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
    <div className="p-4 sm:p-8">
      <PageHeader
        title="หน้าเคาน์เตอร์"
        subtitle={`${hotel.name} · ${new Date(today).toLocaleDateString("th-TH")}`}
      />

      {/* เข้าวันนี้ */}
      <Section title={`เข้าวันนี้ (${arrivalRows.length})`}>
        {arrivalRows.length === 0 ? (
          <Empty>ไม่มีแขกเข้าวันนี้</Empty>
        ) : (
          arrivalRows.map((b) => (
            <RowItem key={b.id} b={b}>
              <ActionButton
                action={checkInBooking}
                hotelSlug={hotel.slug}
                bookingId={b.id}
                label="เช็คอิน"
                variant="primary"
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
              <RowItem key={b.id} b={b} balance={bal}>
                <ActionButton
                  action={checkOutBooking}
                  hotelSlug={hotel.slug}
                  bookingId={b.id}
                  label="เช็คเอาท์"
                  variant={bal > 0 ? "disabled-hint" : "primary"}
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
            <RowItem key={b.id} b={b} balance={balMap.get(b.id) ?? 0} />
          ))
        )}
      </Section>
    </div>
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
  children,
}: {
  b: Row;
  balance?: number;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border p-3 text-sm">
      <div>
        <span className="font-mono">{b.code}</span>
        <span className="ml-2 font-medium">{b.guests?.full_name ?? "-"}</span>
        <span className="ml-2 text-xs text-fg-muted">
          {b.check_in} → {b.check_out}
        </span>
        {balance != null && balance > 0 && (
          <span className="ml-2 text-xs font-medium text-danger">
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
