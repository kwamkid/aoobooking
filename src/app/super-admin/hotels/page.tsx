import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/ui";
import { HotelsTable, type HotelRow } from "./hotels-table";

export default async function SuperAdminHotelsPage() {
  // admin client bypass RLS — เห็นทุก tenant
  const admin = createAdminClient();

  const [{ data: hotels }, { data: members }] = await Promise.all([
    admin
      .from("hotels")
      .select(
        "id, name, slug, created_at, is_active, multi_property, packages(name, slug)",
      )
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    admin.from("hotel_members").select("hotel_id"),
  ]);

  // นับสมาชิกต่อโรงแรม (PostgREST ไม่ให้ aggregate ตรงๆ → map เอง)
  const memberCounts = new Map<string, number>();
  for (const m of members ?? []) {
    memberCounts.set(m.hotel_id, (memberCounts.get(m.hotel_id) ?? 0) + 1);
  }

  const rows: HotelRow[] = (hotels ?? []).map((h) => ({
    id: h.id,
    name: h.name,
    slug: h.slug,
    created_at: h.created_at,
    is_active: h.is_active,
    multi_property: h.multi_property,
    packageName: h.packages?.name ?? null,
    memberCount: memberCounts.get(h.id) ?? 0,
  }));

  return (
    <div className="p-4 sm:p-8">
      <PageHeader title="โรงแรมทั้งหมด" subtitle={`${rows.length} โรงแรม`} />
      <HotelsTable hotels={rows} />
    </div>
  );
}
