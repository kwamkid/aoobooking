import Link from "next/link";
import { requireHotelMember, isOwner } from "@/lib/auth";
import { listPublicPackages, getSubscription } from "@/lib/billing";
import { hotelHref } from "@/lib/hotel/href";
import {
  Building2,
  BedDouble,
  Users,
  Globe,
  Check,
  Minus,
} from "lucide-react";
import { AppPage, Card, Button, Badge } from "@/components/ui";
import {
  upgradePackage,
  scheduleDowngrade,
  cancelScheduledDowngrade,
} from "./actions";
import { RedeemForm } from "./redeem-form";

type Tone = "neutral" | "brand" | "success" | "warning" | "danger" | "info";
const SUB_STATUS_TONE: Record<string, Tone> = {
  active: "success",
  trialing: "info",
  grace: "warning",
  past_due: "warning",
  canceled: "danger",
  cancelled: "danger",
};

export default async function PackageSettingsPage({
  params,
}: {
  params: Promise<{ hotel: string }>;
}) {
  const { hotel: hotelSlug } = await params;
  const { hotel, role } = await requireHotelMember(hotelSlug);
  const owner = isOwner(role);

  const [packages, sub] = await Promise.all([
    listPublicPackages(),
    getSubscription(hotel.id),
  ]);

  const currentIdx = packages.findIndex((p) => p.id === hotel.package_id);
  const scheduledPkg = packages.find((p) => p.id === sub?.scheduled_package_id);

  return (
    <AppPage
      title="แพ็กเกจ"
      subtitle={
        <>
          {hotel.name} ·{" "}
          <Link
            href={hotelHref("/settings/billing", hotel.slug)}
            className="text-brand underline"
          >
            ประวัติการชำระเงิน
          </Link>
        </>
      }
    >

      {sub && (
        <Card className="text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-fg-muted">สถานะ:</span>
            <Badge tone={SUB_STATUS_TONE[sub.status] ?? "neutral"}>
              {sub.status}
            </Badge>
            <span className="text-fg-muted">
              · รอบปัจจุบันถึง{" "}
              {new Date(sub.current_period_end).toLocaleDateString("th-TH")}
            </span>
          </div>
          {sub.status === "trialing" && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge tone="info">ทดลองใช้ฟรี</Badge>
              <span className="text-fg-muted">
                ทดลองใช้ฟรีถึง{" "}
                {new Date(sub.current_period_end).toLocaleDateString("th-TH")}
              </span>
            </div>
          )}
          {scheduledPkg && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-warning-strong">
              <span>
                นัดดาวน์เกรดเป็น <b className="font-semibold">{scheduledPkg.name}</b>{" "}
                ตอนจบรอบ
              </span>
              {owner && (
                <form action={cancelScheduledDowngrade}>
                  <input type="hidden" name="hotelSlug" value={hotel.slug} />
                  <Button type="submit" variant="ghost" size="sm">
                    ยกเลิกนัด
                  </Button>
                </form>
              )}
            </div>
          )}
        </Card>
      )}

      {owner && <RedeemForm hotelSlug={hotel.slug} />}

      {!owner && (
        <p className="mt-4 text-sm text-warning-strong">
          เฉพาะเจ้าของ (owner) เท่านั้นที่เปลี่ยนแพ็กเกจได้
        </p>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {packages.map((pkg, idx) => {
          const isCurrent = pkg.id === hotel.package_id;
          const isUpgrade = currentIdx === -1 || idx > currentIdx;
          const limits = [
            { Icon: Building2, label: "สาขา", value: pkg.max_properties },
            { Icon: BedDouble, label: "ห้องพัก", value: pkg.max_rooms },
            { Icon: Users, label: "ทีมงาน", value: pkg.max_team_members },
            { Icon: Globe, label: "ช่อง OTA", value: pkg.max_ota_channels },
          ];
          // จุดขายจริงของแต่ละแพ็ก — รวมโมดูลเช่ารายเดือนที่เพิ่งเพิ่ม
          const features = [
            { label: "จองรายวัน (PMS)", on: true },
            { label: "เช่ารายเดือน (ผู้เช่า)", on: pkg.allow_monthly_rental },
            { label: "รับจองหน้าเว็บ", on: pkg.allow_booking_engine },
            { label: "เชื่อม OTA (Agoda/Booking)", on: pkg.allow_channel_manager },
            { label: "ปรับราคาอัตโนมัติ", on: pkg.allow_dynamic_pricing },
            { label: "รายงานขั้นสูง", on: pkg.allow_advanced_reports },
          ];
          return (
            <Card
              key={pkg.id}
              pad={false}
              className={`flex flex-col ${
                isCurrent ? "ring-2 ring-brand" : ""
              }`}
            >
              {/* หัวการ์ด */}
              <div
                className={`rounded-t-(--radius-lg) border-b border-border p-5 ${
                  isCurrent ? "bg-brand-soft/40" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-lg font-bold text-fg">{pkg.name}</h2>
                  {isCurrent && <Badge tone="brand">ใช้อยู่</Badge>}
                </div>
                <div className="mt-2 text-fg">
                  {pkg.price_thb_monthly == null ? (
                    <span className="text-2xl font-bold">ติดต่อเรา</span>
                  ) : pkg.price_thb_monthly === 0 ? (
                    <span className="text-3xl font-bold">ฟรี</span>
                  ) : (
                    <>
                      <span className="text-3xl font-bold tabular-nums">
                        ฿{pkg.price_thb_monthly.toLocaleString()}
                      </span>
                      <span className="ml-1 text-base text-fg-muted">/เดือน</span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex flex-1 flex-col p-5">
                {/* limits */}
                <ul className="space-y-2">
                  {limits.map((l) => (
                    <li key={l.label} className="flex items-center gap-2.5 text-base">
                      <l.Icon size={16} className="shrink-0 text-fg-subtle" />
                      <span className="text-fg-muted">{l.label}</span>
                      <span className="ml-auto font-medium tabular-nums text-fg">
                        {l.value ?? "ไม่จำกัด"}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* features ✓/− */}
                <ul className="mt-4 space-y-2 border-t border-border pt-4">
                  {features.map((ft) => (
                    <li key={ft.label} className="flex items-center gap-2.5 text-base">
                      {ft.on ? (
                        <Check
                          size={16}
                          strokeWidth={3}
                          className="shrink-0 text-success-strong"
                        />
                      ) : (
                        <Minus size={16} className="shrink-0 text-fg-subtle" />
                      )}
                      <span className={ft.on ? "text-fg" : "text-fg-subtle"}>
                        {ft.label}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* ปุ่มชิดล่างเสมอ — ทุกการ์ดสูงเท่ากัน */}
                <div className="mt-auto pt-5">
                  {isCurrent ? (
                    <Button variant="secondary" className="w-full" disabled>
                      แพ็กเกจปัจจุบัน
                    </Button>
                  ) : owner && pkg.price_thb_monthly != null ? (
                    <form action={isUpgrade ? upgradePackage : scheduleDowngrade}>
                      <input type="hidden" name="hotelSlug" value={hotel.slug} />
                      <input type="hidden" name="packageSlug" value={pkg.slug} />
                      {isUpgrade && (
                        <input type="hidden" name="cycle" value="monthly" />
                      )}
                      <Button
                        type="submit"
                        variant={isUpgrade ? "primary" : "ghost"}
                        className="w-full"
                      >
                        {isUpgrade
                          ? pkg.price_thb_monthly === 0
                            ? "เปลี่ยนเป็นแพ็กนี้"
                            : "อัพเกรด"
                          : "ดาวน์เกรด (มีผลตอนจบรอบ)"}
                      </Button>
                    </form>
                  ) : null}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <p className="mt-6 text-sm text-fg-subtle">
        อัพเกรดมีผลทันทีหลังชำระ (เริ่มนับรอบใหม่) · ดาวน์เกรดมีผลตอนจบรอบปัจจุบัน
        ไม่คืนเงินส่วนต่าง · ทุกการเปลี่ยนแปลงถูกบันทึก log
      </p>
    </AppPage>
  );
}
