import { createAdminClient } from "@/lib/supabase/admin";
import { SearchBox, EmptyState, PageHeader, Badge } from "@/components/ui";

// audit_logs: hotel_id (nullable = platform-level) + actor_id (nullable = ระบบ/cron)
// FK ไป hotels/profiles อย่างละตัว → embed ไม่กำกวม แต่ระบุ hint กัน drift ถ้ามี FK เพิ่มทีหลัง
type AuditRow = {
  id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  old_data: unknown;
  new_data: unknown;
  note: string | null;
  created_at: string;
  hotel_id: string | null;
  hotels: { name: string; slug: string } | null;
  profiles: { full_name: string | null; email: string | null } | null;
};

export default async function SuperAdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string }>;
}) {
  const { action } = await searchParams;

  // admin client bypass RLS — เห็น log ทุกโรงแรม + platform (guard superadmin อยู่ที่ layout)
  const admin = createAdminClient();
  let query = admin
    .from("audit_logs")
    .select(
      "id, action, entity_type, entity_id, old_data, new_data, note, created_at, hotel_id, hotels!hotel_id(name, slug), profiles!actor_id(full_name, email)",
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (action?.trim()) query = query.ilike("action", `%${action.trim()}%`);

  const { data } = await query;
  const rows = (data ?? []) as unknown as AuditRow[];

  return (
    <div className="p-4 sm:p-8">
      <PageHeader title="บันทึกกิจกรรม" subtitle="100 รายการล่าสุดทั้งระบบ" />

      <form className="mb-6">
        <SearchBox
          name="action"
          defaultValue={action ?? ""}
          placeholder="กรอง action เช่น package.updated"
          className="max-w-sm"
        />
      </form>

      {rows.length === 0 ? (
        <EmptyState art="search" title="ยังไม่มีบันทึก" />
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="card p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-medium text-fg">{r.action}</span>
                  {r.hotel_id ? (
                    <Badge tone="brand">{r.hotels?.name ?? "โรงแรมถูกลบ"}</Badge>
                  ) : (
                    <Badge tone="neutral">ระบบ/platform</Badge>
                  )}
                </span>
                <span className="text-xs text-fg-subtle">
                  {new Date(r.created_at).toLocaleString("th-TH")}
                </span>
              </div>
              <div className="mt-0.5 text-xs text-fg-muted">
                {r.profiles?.full_name ?? r.profiles?.email ?? "ระบบ"}
                {r.entity_type ? ` · ${r.entity_type}` : ""}
                {r.note ? ` · ${r.note}` : ""}
              </div>
              {(r.old_data != null || r.new_data != null) && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs text-fg-subtle">ดู diff</summary>
                  <div className="mt-1 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                    <pre className="overflow-x-auto rounded bg-danger-soft p-2 text-danger">
                      {r.old_data ? JSON.stringify(r.old_data, null, 2) : "—"}
                    </pre>
                    <pre className="overflow-x-auto rounded bg-success-soft p-2 text-success">
                      {r.new_data ? JSON.stringify(r.new_data, null, 2) : "—"}
                    </pre>
                  </div>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
