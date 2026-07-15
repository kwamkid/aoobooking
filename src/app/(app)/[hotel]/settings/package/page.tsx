import Link from "next/link";
import { requireHotelMember, isOwner } from "@/lib/auth";
import { listPublicPackages, getSubscription } from "@/lib/billing";
import { hotelHref } from "@/lib/hotel/href";
import { Card, Button, Badge, PageHeader } from "@/components/ui";
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
    <div className="p-4 sm:p-8">
      <PageHeader
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
      />

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
            <div className="mt-2 flex flex-wrap items-center gap-2 text-warning">
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
        <p className="mt-4 text-sm text-warning">
          เฉพาะเจ้าของ (owner) เท่านั้นที่เปลี่ยนแพ็กเกจได้
        </p>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {packages.map((pkg, idx) => {
          const isCurrent = pkg.id === hotel.package_id;
          const isUpgrade = currentIdx === -1 || idx > currentIdx;
          return (
            <Card
              key={pkg.id}
              className={
                isCurrent ? "border-border-strong ring-1 ring-brand" : undefined
              }
            >
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="font-bold text-fg">{pkg.name}</h2>
                {isCurrent && <Badge tone="brand">แพ็กเกจปัจจุบัน</Badge>}
              </div>
              <div className="mt-1 text-2xl font-bold text-fg">
                {pkg.price_thb_monthly == null
                  ? "ติดต่อเรา"
                  : pkg.price_thb_monthly === 0
                    ? "ฟรี"
                    : `฿${pkg.price_thb_monthly.toLocaleString()}/ด.`}
              </div>
              <ul className="mt-3 space-y-1 text-sm text-fg-muted">
                <li>สาขา: {pkg.max_properties ?? "ไม่จำกัด"}</li>
                <li>ห้องพัก: {pkg.max_rooms ?? "ไม่จำกัด"}</li>
                <li>ทีมงาน: {pkg.max_team_members ?? "ไม่จำกัด"}</li>
                <li>OTA: {pkg.max_ota_channels ?? "ไม่จำกัด"}</li>
              </ul>

              {owner && !isCurrent && pkg.price_thb_monthly != null && (
                <form
                  action={isUpgrade ? upgradePackage : scheduleDowngrade}
                  className="mt-4"
                >
                  <input type="hidden" name="hotelSlug" value={hotel.slug} />
                  <input type="hidden" name="packageSlug" value={pkg.slug} />
                  {isUpgrade && (
                    <input type="hidden" name="cycle" value="monthly" />
                  )}
                  <Button
                    type="submit"
                    variant={isUpgrade ? "primary" : "secondary"}
                    className="w-full"
                  >
                    {isUpgrade
                      ? pkg.price_thb_monthly === 0
                        ? "เปลี่ยนเป็นแพ็กนี้"
                        : "อัพเกรด"
                      : "ดาวน์เกรด (มีผลตอนจบรอบ)"}
                  </Button>
                </form>
              )}
            </Card>
          );
        })}
      </div>

      <p className="mt-6 text-xs text-fg-subtle">
        อัพเกรดมีผลทันทีหลังชำระ (เริ่มนับรอบใหม่) · ดาวน์เกรดมีผลตอนจบรอบปัจจุบัน
        ไม่คืนเงินส่วนต่าง · ทุกการเปลี่ยนแปลงถูกบันทึก log
      </p>
    </div>
  );
}
