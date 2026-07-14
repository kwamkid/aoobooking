import Link from "next/link";
import { requireHotelMember, isOwner } from "@/lib/auth";
import { listPublicPackages, getSubscription } from "@/lib/billing";
import { hotelHref } from "@/lib/hotel/href";
import {
  upgradePackage,
  scheduleDowngrade,
  cancelScheduledDowngrade,
} from "./actions";

export default async function PackageSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ h?: string }>;
}) {
  const { h } = await searchParams;
  const { hotel, role } = await requireHotelMember(h);
  const owner = isOwner(role);

  const [packages, sub] = await Promise.all([
    listPublicPackages(),
    getSubscription(hotel.id),
  ]);

  const currentIdx = packages.findIndex((p) => p.id === hotel.package_id);
  const scheduledPkg = packages.find((p) => p.id === sub?.scheduled_package_id);

  return (
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="text-2xl font-bold">แพ็กเกจ</h1>
      <p className="mt-1 text-neutral-500">
        {hotel.name} ·{" "}
        <Link href={hotelHref("/settings/billing", hotel.slug)} className="underline">
          ประวัติการชำระเงิน
        </Link>
      </p>

      {sub && (
        <div className="mt-4 rounded-lg border border-neutral-200 p-4 text-sm dark:border-neutral-800">
          สถานะ: <b>{sub.status}</b> · รอบปัจจุบันถึง{" "}
          {new Date(sub.current_period_end).toLocaleDateString("th-TH")}
          {scheduledPkg && (
            <span className="ml-2 text-amber-600">
              — นัดดาวน์เกรดเป็น <b>{scheduledPkg.name}</b> ตอนจบรอบ
              {owner && (
                <form action={cancelScheduledDowngrade} className="mt-1 inline">
                  <input type="hidden" name="hotelSlug" value={hotel.slug} />
                  <button className="ml-2 underline">ยกเลิกนัด</button>
                </form>
              )}
            </span>
          )}
        </div>
      )}

      {!owner && (
        <p className="mt-4 text-sm text-amber-600">
          เฉพาะเจ้าของ (owner) เท่านั้นที่เปลี่ยนแพ็กเกจได้
        </p>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {packages.map((pkg, idx) => {
          const isCurrent = pkg.id === hotel.package_id;
          const isUpgrade = currentIdx === -1 || idx > currentIdx;
          return (
            <div
              key={pkg.id}
              className={`rounded-xl border p-5 ${
                isCurrent
                  ? "border-neutral-900 dark:border-white"
                  : "border-neutral-200 dark:border-neutral-800"
              }`}
            >
              <div className="flex items-baseline justify-between">
                <h2 className="font-bold">{pkg.name}</h2>
                {isCurrent && (
                  <span className="text-xs font-medium text-green-600">
                    แพ็กเกจปัจจุบัน
                  </span>
                )}
              </div>
              <div className="mt-1 text-2xl font-bold">
                {pkg.price_thb_monthly == null
                  ? "ติดต่อเรา"
                  : pkg.price_thb_monthly === 0
                    ? "ฟรี"
                    : `฿${pkg.price_thb_monthly.toLocaleString()}/ด.`}
              </div>
              <ul className="mt-3 space-y-1 text-sm text-neutral-500">
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
                  <button
                    className={`w-full rounded-lg px-4 py-2 text-sm font-medium transition ${
                      isUpgrade
                        ? "bg-neutral-900 text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900"
                        : "border border-neutral-300 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
                    }`}
                  >
                    {isUpgrade
                      ? pkg.price_thb_monthly === 0
                        ? "เปลี่ยนเป็นแพ็กนี้"
                        : "อัพเกรด"
                      : "ดาวน์เกรด (มีผลตอนจบรอบ)"}
                  </button>
                </form>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-6 text-xs text-neutral-400">
        อัพเกรดมีผลทันทีหลังชำระ (เริ่มนับรอบใหม่) · ดาวน์เกรดมีผลตอนจบรอบปัจจุบัน
        ไม่คืนเงินส่วนต่าง · ทุกการเปลี่ยนแปลงถูกบันทึก log
      </p>
    </div>
  );
}
