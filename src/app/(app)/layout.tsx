import { requireUser } from "@/lib/auth";

// (app) group — ต้อง login (chrome/AppShell ย้ายไป [hotel]/layout เพราะต้องรู้ hotel จาก path)
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireUser();
  return children;
}
