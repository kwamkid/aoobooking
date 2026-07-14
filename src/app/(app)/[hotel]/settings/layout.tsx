import { PageHeader } from "@/components/ui";
import { SettingsNav } from "./settings-nav";

// settings layout — หัวข้อ "ตั้งค่า" + tab nav (แบบ aoosocial) ครอบทุกหน้า settings
// แต่ละ page ข้างในไม่ต้องมี PageHeader ของตัวเองแล้ว (มี title ที่นี่)
export default async function SettingsLayout({
  params,
  children,
}: {
  params: Promise<{ hotel: string }>;
  children: React.ReactNode;
}) {
  const { hotel } = await params;
  return (
    <div className="p-4 sm:p-8">
      <PageHeader title="ตั้งค่า" />
      <SettingsNav hotelSlug={hotel} />
      {children}
    </div>
  );
}
