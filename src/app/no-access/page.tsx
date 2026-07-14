import Link from "next/link";

export default function NoAccessPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-bold">ไม่มีสิทธิ์เข้าถึง</h1>
      <p className="text-neutral-500">คุณไม่มีสิทธิ์เข้าหน้านี้</p>
      <Link href="/onboarding" className="text-blue-600 underline">
        กลับหน้าหลัก
      </Link>
    </main>
  );
}
