import { requireHotelMember } from "@/lib/auth";
import { hotelHref } from "@/lib/hotel/href";
import { createClient } from "@/lib/supabase/server";
import {
  AppPage,
  PageHeader,
  SearchBox,
  EmptyState,
  ButtonLink,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from "@/components/ui";

type GuestSafe = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  nationality: string | null;
  pdpa_consent_at: string | null;
};

export default async function GuestsPage({
  params,
  searchParams,
}: {
  params: Promise<{ hotel: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { hotel: hotelSlug } = await params;
  const { q } = await searchParams;
  const { hotel } = await requireHotelMember(hotelSlug);
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
    <AppPage title="แขก" subtitle={hotel.name}>

      <form className="mb-6">
        <SearchBox
          name="q"
          defaultValue={q ?? ""}
          placeholder="ค้นชื่อ / เบอร์ / อีเมล"
          className="max-w-sm"
        />
      </form>

      {guests.length === 0 ? (
        <EmptyState
          art="guest"
          title={q ? "ไม่พบแขกที่ค้นหา" : "ยังไม่มีแขก"}
          description={q ? undefined : "แขกจะถูกสร้างเมื่อมีการจอง"}
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>ชื่อ</TH>
              <TH>ติดต่อ</TH>
              <TH>สัญชาติ</TH>
              <TH>PDPA</TH>
              <TH></TH>
            </TR>
          </THead>
          <TBody>
            {guests.map((g) => (
              <TR key={g.id}>
                <TD className="font-medium">{g.full_name}</TD>
                <TD className="text-fg-muted">
                  {g.phone ?? ""}
                  {g.phone && g.email ? " · " : ""}
                  {g.email ?? ""}
                </TD>
                <TD className="text-fg-muted">{g.nationality ?? "-"}</TD>
                <TD>
                  {g.pdpa_consent_at ? (
                    <span className="text-sm text-success-strong">✓ ยินยอม</span>
                  ) : (
                    <span className="text-xs text-fg-subtle">—</span>
                  )}
                </TD>
                <TD className="text-right">
                  <ButtonLink
                    href={hotelHref(`/guests/${g.id}`, hotel.slug)}
                    variant="ghost"
                    size="sm"
                  >
                    รายละเอียด
                  </ButtonLink>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </AppPage>
  );
}
