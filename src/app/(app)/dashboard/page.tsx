import { requireHotelMember } from "@/lib/auth";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ h?: string }>;
}) {
  const { h } = await searchParams;
  const { hotel, role } = await requireHotelMember(h);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">{hotel.name}</h1>
      <p className="mt-1 text-neutral-500">
        ภาพรวม · สิทธิ์ของคุณ: <span className="font-mono">{role}</span>
      </p>
      <div className="mt-8 rounded-lg border border-dashed border-neutral-300 p-8 text-center text-neutral-400 dark:border-neutral-700">
        Phase 1 — PMS Core จะเริ่มที่นี่ (ห้อง/ราคา/ปฏิทิน/การจอง)
      </div>
    </div>
  );
}
