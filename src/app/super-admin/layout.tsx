import { requireSuperAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SuperAdminShell } from "./super-admin-shell";

export const metadata = { title: "Super Admin — AooBooking" };

// `.super-admin` scope accent แดงอิฐเฉพาะ subtree นี้ (globals.css) —
// รู้ทันทีว่าอยู่โซน platform ไม่ใช่หลังบ้านโรงแรม
export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireSuperAdmin();

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", user.id)
    .maybeSingle();
  const p = profile as { full_name: string | null; email: string | null } | null;

  return (
    <div className="super-admin">
      <SuperAdminShell
        user={{
          name: p?.full_name ?? "",
          email: p?.email ?? user.email ?? "",
        }}
      >
        {children}
      </SuperAdminShell>
    </div>
  );
}
