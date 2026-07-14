import { requireHotelMember } from "@/lib/auth";
import { can } from "@/lib/permission";
import { hotelHref } from "@/lib/hotel/href";
import { createClient } from "@/lib/supabase/server";
import {
  PageHeader,
  ButtonLink,
  Badge,
  BOOKING_STATUS_TONE,
  EmptyState,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from "@/components/ui";

type Booking = {
  id: string;
  code: string;
  status: string;
  check_in: string;
  check_out: string;
  total_satang: number;
  guests: { full_name: string } | null;
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
    <div className="p-4 sm:p-8">
      <PageHeader
        title="การจอง"
        subtitle={hotel.name}
        action={
          canCreate && (
            <ButtonLink href={hotelHref("/bookings/new", hotel.slug)}>+ จองใหม่</ButtonLink>
          )
        }
      />

      {bookings.length === 0 ? (
        <EmptyState
          art="calendar"
          title="ยังไม่มีการจอง"
          description="เริ่มรับจองจากหน้าเคาน์เตอร์ได้เลย"
          action={
            canCreate && (
              <ButtonLink href={hotelHref("/bookings/new", hotel.slug)}>+ จองใหม่</ButtonLink>
            )
          }
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>โค้ด</TH>
              <TH>แขก</TH>
              <TH>เข้า–ออก</TH>
              <TH>สถานะ</TH>
              <TH className="text-right">ยอด</TH>
            </TR>
          </THead>
          <TBody>
            {bookings.map((b) => (
              <TR key={b.id}>
                <TD className="font-mono">{b.code}</TD>
                <TD>{b.guests?.full_name ?? "-"}</TD>
                <TD className="whitespace-nowrap text-fg-muted">
                  {b.check_in} → {b.check_out}
                </TD>
                <TD>
                  <Badge tone={BOOKING_STATUS_TONE[b.status] ?? "neutral"}>{b.status}</Badge>
                </TD>
                <TD className="text-right font-medium">
                  {(b.total_satang / 100).toLocaleString()}฿
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
