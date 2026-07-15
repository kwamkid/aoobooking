import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/ui";
import { PackageTable, type PackageRow } from "./package-form";

export default async function PackagesPage() {
  // admin client bypass RLS — เห็นทุกแพ็กเกจรวม invite-only (guard superadmin อยู่ที่ layout)
  const admin = createAdminClient();
  const { data } = await admin.from("packages").select("*").order("sort_order");

  return (
    <div className="p-4 sm:p-8">
      <PageHeader
        title="แพ็กเกจ"
        subtitle="แก้ราคา/limit — มีผลกับทุกโรงแรมใน tier นั้นทันที"
      />
      <PackageTable rows={(data ?? []) as PackageRow[]} />
    </div>
  );
}
