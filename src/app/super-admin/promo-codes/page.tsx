import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader, type SelectOption } from "@/components/ui";
import { PromoForm, PromoTable, type PromoRow } from "./promo-form";

export default async function PromoCodesPage() {
  // admin client bypass RLS — เห็นทุกโค้ด (guard superadmin อยู่ที่ layout)
  const admin = createAdminClient();
  const [{ data: promos }, { data: packages }] = await Promise.all([
    admin
      .from("promo_codes")
      .select("*, packages(name, slug)")
      .order("created_at", { ascending: false }),
    admin.from("packages").select("id, name").order("name"),
  ]);

  const packageOptions: SelectOption[] = (packages ?? []).map((p) => ({
    value: p.id,
    label: p.name,
  }));

  return (
    <div className="p-4 sm:p-8">
      <PageHeader
        title="โค้ดโปรโมชัน"
        subtitle="ให้โรงแรมกรอกโค้ดเพื่อใช้ฟรี N เดือน"
        action={<PromoForm packages={packageOptions} />}
      />
      <PromoTable rows={(promos ?? []) as PromoRow[]} />
    </div>
  );
}
