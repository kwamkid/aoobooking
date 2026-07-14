import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { AppShell } from "./app-shell";

// (app) group = หลังบ้าน PMS — ต้อง login
// ⚠️ layout ไม่ได้รับ searchParams → guard tenant (?h=) ยังอยู่ระดับ page ทุกหน้า (NOTES)
// layout โหลดแค่ chrome + บังคับ login เท่านั้น
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireUser();

  return (
    <Suspense>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}
