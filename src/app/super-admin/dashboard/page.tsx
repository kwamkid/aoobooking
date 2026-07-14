import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader, Card } from "@/components/ui";

export default async function SuperAdminDashboard() {
  // admin client bypass RLS — เห็นทุก tenant
  const admin = createAdminClient();
  const [{ count: hotelCount }, { count: userCount }] = await Promise.all([
    admin.from("hotels").select("*", { count: "exact", head: true }),
    admin.from("profiles").select("*", { count: "exact", head: true }),
  ]);

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-8">
      <PageHeader title="ภาพรวมระบบ" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="โรงแรมทั้งหมด" value={hotelCount ?? 0} />
        <Stat label="ผู้ใช้ทั้งหมด" value={userCount ?? 0} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <div className="text-2xl font-bold text-fg">{value}</div>
      <div className="text-sm text-fg-muted">{label}</div>
    </Card>
  );
}
