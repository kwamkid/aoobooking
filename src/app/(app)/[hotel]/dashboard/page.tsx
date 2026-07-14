import { requireHotelMember } from "@/lib/auth";
import { hotelHref } from "@/lib/hotel/href";
import { PageHeader, Card, ButtonLink, Badge } from "@/components/ui";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ hotel: string }>;
}) {
  const { hotel: hotelSlug } = await params;
  const { hotel, role } = await requireHotelMember(hotelSlug);

  const quickLinks = [
    { href: "/bookings/new", label: "จองใหม่", primary: true },
    { href: "/front-desk", label: "หน้าเคาน์เตอร์" },
    { href: "/calendar", label: "ปฏิทินห้องว่าง" },
    { href: "/rooms", label: "จัดการห้อง" },
  ];

  return (
    <div className="p-4 sm:p-8">
      <PageHeader
        title={hotel.name}
        subtitle={
          <span className="inline-flex items-center gap-2">
            ภาพรวม · สิทธิ์ของคุณ <Badge tone="brand">{role}</Badge>
          </span>
        }
      />

      <Card>
        <h2 className="font-semibold text-fg">เริ่มใช้งาน</h2>
        <p className="mt-1 text-sm text-fg-muted">
          ตั้งค่าสาขา → เพิ่มห้อง → ตั้งราคา แล้วเริ่มรับจองได้เลย
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {quickLinks.map((l) => (
            <ButtonLink
              key={l.href}
              href={hotelHref(l.href, hotel.slug)}
              variant={l.primary ? "primary" : "secondary"}
            >
              {l.label}
            </ButtonLink>
          ))}
        </div>
      </Card>
    </div>
  );
}
