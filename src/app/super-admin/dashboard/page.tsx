import { createAdminClient } from "@/lib/supabase/admin";

export default async function SuperAdminDashboard() {
  // admin client bypass RLS — เห็นทุก tenant
  const admin = createAdminClient();
  const [{ count: hotelCount }, { count: userCount }] = await Promise.all([
    admin.from("hotels").select("*", { count: "exact", head: true }),
    admin.from("profiles").select("*", { count: "exact", head: true }),
  ]);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">ภาพรวมระบบ</h1>
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="โรงแรมทั้งหมด" value={hotelCount ?? 0} />
        <Stat label="ผู้ใช้ทั้งหมด" value={userCount ?? 0} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-sm text-neutral-500">{label}</div>
    </div>
  );
}
