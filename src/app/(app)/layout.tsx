import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "./app-shell";

// (app) group = หลังบ้าน PMS — ต้อง login
// ⚠️ layout ไม่ได้รับ searchParams → guard tenant (?h=) ยังอยู่ระดับ page ทุกหน้า (NOTES)
// layout โหลดแค่ chrome + user info สำหรับ top bar เท่านั้น
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", user.id)
    .single();
  const p = profile as { full_name: string | null; email: string | null } | null;

  return (
    <Suspense>
      <AppShell
        user={{
          name: p?.full_name ?? "",
          email: p?.email ?? user.email ?? "",
        }}
      >
        {children}
      </AppShell>
    </Suspense>
  );
}
