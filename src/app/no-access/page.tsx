import { ButtonLink } from "@/components/ui";

export default function NoAccessPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-bg p-6 text-center">
      <h1 className="text-2xl font-bold text-fg">ไม่มีสิทธิ์เข้าถึง</h1>
      <p className="text-fg-muted">คุณไม่มีสิทธิ์เข้าหน้านี้</p>
      <ButtonLink href="/onboarding" variant="secondary">
        กลับหน้าหลัก
      </ButtonLink>
    </main>
  );
}
