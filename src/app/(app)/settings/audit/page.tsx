import { requireHotelMember } from "@/lib/auth";
import { can } from "@/lib/permission";
import { createClient } from "@/lib/supabase/server";

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
  searchParams,
}: {
  searchParams: Promise<{ h?: string; action?: string }>;
}) {
  const { h, action } = await searchParams;
  const { hotel } = await requireHotelMember(h);
  // audit ดูได้เฉพาะ owner/admin — RLS จำกัดไว้แล้ว แต่เช็คที่ app เพื่อ UX (ชั้นที่ 3)
  const canManage = await can(hotel.id, "settings.team");

  if (!canManage) {
    return (
      <div className="mx-auto max-w-4xl p-8">
        <h1 className="text-2xl font-bold">บันทึกกิจกรรม</h1>
        <p className="mt-4 text-neutral-500">เฉพาะเจ้าของ/ผู้ดูแลเท่านั้นที่ดูบันทึกได้</p>
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
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="text-2xl font-bold">บันทึกกิจกรรม</h1>
      <p className="mt-1 text-sm text-neutral-500">{hotel.name} · 100 รายการล่าสุด</p>

      <form className="mt-4">
        <input type="hidden" name="h" value={hotel.slug} />
        <input
          name="action"
          defaultValue={action ?? ""}
          placeholder="กรอง action เช่น booking.created"
          className="w-full max-w-sm rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
      </form>

      {rows.length === 0 ? (
        <p className="mt-8 text-neutral-400">ยังไม่มีบันทึก</p>
      ) : (
        <ul className="mt-6 space-y-2">
          {rows.map((r) => (
            <li
              key={r.id}
              className="rounded-lg border border-neutral-200 p-3 text-sm dark:border-neutral-800"
            >
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-xs font-medium">{r.action}</span>
                <span className="text-xs text-neutral-400">
                  {new Date(r.created_at).toLocaleString("th-TH")}
                </span>
              </div>
              <div className="mt-0.5 text-xs text-neutral-500">
                {r.profiles?.full_name ?? r.profiles?.email ?? (r.actor_id ? "ผู้ใช้" : "ระบบ")}
                {r.entity_type ? ` · ${r.entity_type}` : ""}
                {r.note ? ` · ${r.note}` : ""}
              </div>
              {(r.old_data != null || r.new_data != null) && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs text-neutral-400">
                    ดู diff
                  </summary>
                  <div className="mt-1 grid grid-cols-2 gap-2 text-xs">
                    <pre className="overflow-x-auto rounded bg-red-50 p-2 dark:bg-red-950/20">
                      {r.old_data ? JSON.stringify(r.old_data, null, 2) : "—"}
                    </pre>
                    <pre className="overflow-x-auto rounded bg-green-50 p-2 dark:bg-green-950/20">
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
