import { requireHotelMember } from "@/lib/auth";
import { can } from "@/lib/permission";
import { createClient } from "@/lib/supabase/server";
import { SearchBox, EmptyState, PageHeader } from "@/components/ui";

type AuditRow = {
  id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  old_data: unknown;
  new_data: unknown;
  note: string | null;
  created_at: string;
  actor_id: string | null;
  profiles: { full_name: string | null; email: string | null } | null;
};

export default async function AuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ hotel: string }>;
  searchParams: Promise<{ action?: string }>;
}) {
  const { hotel: hotelSlug } = await params;
  const { action } = await searchParams;
  const { hotel } = await requireHotelMember(hotelSlug);
  // audit ดูได้เฉพาะ owner/admin — RLS จำกัดไว้แล้ว แต่เช็คที่ app เพื่อ UX (ชั้นที่ 3)
  const canManage = await can(hotel.id, "settings.team");

  if (!canManage) {
    return (
      <div className="p-4 sm:p-8">
        <PageHeader title="บันทึกกิจกรรม" subtitle={hotel.name} />
        <p className="text-fg-muted">เฉพาะเจ้าของ/ผู้ดูแลเท่านั้นที่ดูบันทึกได้</p>
      </div>
    );
  }

  const supabase = await createClient();
  let query = supabase
    .from("audit_logs")
    .select(
      "id, action, entity_type, entity_id, old_data, new_data, note, created_at, actor_id, profiles(full_name, email)",
    )
    .eq("hotel_id", hotel.id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (action?.trim()) query = query.ilike("action", `%${action.trim()}%`);

  const { data } = await query;
  const rows = (data ?? []) as unknown as AuditRow[];

  return (
    <div className="p-4 sm:p-8">
      <PageHeader title="บันทึกกิจกรรม" subtitle={`${hotel.name} · 100 รายการล่าสุด`} />

      <form className="mb-6">
        <SearchBox
          name="action"
          defaultValue={action ?? ""}
          placeholder="กรอง action เช่น booking.created"
          className="max-w-sm"
        />
      </form>

      {rows.length === 0 ? (
        <EmptyState art="search" title="ยังไม่มีบันทึก" />
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="card p-3 text-sm">
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-xs font-medium">{r.action}</span>
                <span className="text-xs text-fg-subtle">
                  {new Date(r.created_at).toLocaleString("th-TH")}
                </span>
              </div>
              <div className="mt-0.5 text-xs text-fg-muted">
                {r.profiles?.full_name ?? r.profiles?.email ?? (r.actor_id ? "ผู้ใช้" : "ระบบ")}
                {r.entity_type ? ` · ${r.entity_type}` : ""}
                {r.note ? ` · ${r.note}` : ""}
              </div>
              {(r.old_data != null || r.new_data != null) && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs text-fg-subtle">
                    ดู diff
                  </summary>
                  <div className="mt-1 grid grid-cols-2 gap-2 text-xs">
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
