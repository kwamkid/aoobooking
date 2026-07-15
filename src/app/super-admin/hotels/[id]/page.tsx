import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  PageHeader,
  Card,
  Badge,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
  type SelectOption,
} from "@/components/ui";
import { GrantPromotionForm } from "./grant-promotion-form";

const SUB_STATUS_TONE: Record<
  string,
  "success" | "info" | "warning" | "danger" | "neutral"
> = {
  active: "success",
  trialing: "info",
  grace: "warning",
  canceled: "danger",
  expired: "danger",
};

const INVOICE_STATUS_TONE: Record<
  string,
  "success" | "info" | "warning" | "danger" | "neutral"
> = {
  paid: "success",
  pending: "warning",
  failed: "danger",
  expired: "danger",
  void: "neutral",
};

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** satang → บาท (เงินเก็บเป็น satang เสมอ — rules.md) */
function formatSatang(satang: number, currency: string) {
  return `${(satang / 100).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

export default async function SuperAdminHotelDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // admin client bypass RLS — เห็นทุก tenant
  const admin = createAdminClient();

  const { data: hotel } = await admin
    .from("hotels")
    .select(
      "id, name, slug, created_at, is_active, multi_property, base_currency, package_id, packages(id, name, slug)",
    )
    .eq("id", id)
    .maybeSingle();

  if (!hotel) notFound();

  const [{ data: members }, { data: subscription }, { data: invoices }, { data: packages }] =
    await Promise.all([
      admin
        .from("hotel_members")
        // hint !user_id — hotel_members มี FK ไป profiles 2 ตัว (user_id, invited_by)
        .select("user_id, role, joined_at, profiles!user_id(full_name, email)")
        .eq("hotel_id", id)
        .order("joined_at", { ascending: true }),
      admin
        .from("subscriptions")
        // hint !package_id — subscriptions มี FK ไป packages 2 ตัว (package_id, scheduled_package_id)
        .select(
          "status, current_period_end, grace_until, billing_cycle, packages!package_id(name)",
        )
        .eq("hotel_id", id)
        .maybeSingle(),
      admin
        .from("invoices")
        .select(
          "id, amount_satang, currency, status, billing_cycle, created_at, paid_at, packages(name)",
        )
        .eq("hotel_id", id)
        .order("created_at", { ascending: false })
        .limit(5),
      admin
        .from("packages")
        .select("id, name, slug")
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
    ]);

  const packageOptions: SelectOption[] = (packages ?? []).map((p) => ({
    value: p.id,
    label: p.name,
  }));

  return (
    <div className="p-4 sm:p-8">
      <Link
        href="/super-admin/hotels"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg"
      >
        <ArrowLeft size={16} />
        โรงแรมทั้งหมด
      </Link>

      <PageHeader
        title={hotel.name}
        subtitle={`/${hotel.slug}`}
        action={
          <GrantPromotionForm
            hotelId={hotel.id}
            packageOptions={packageOptions}
            defaultPackageId={hotel.package_id ?? undefined}
          />
        }
      />

      <div className="space-y-6">
        {/* ── ข้อมูลโรงแรม ── */}
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-fg">ข้อมูลโรงแรม</h2>
          <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            <Info label="ชื่อ" value={hotel.name} />
            <Info label="URL" value={`/${hotel.slug}`} />
            <Info
              label="แพ็กเกจปัจจุบัน"
              value={
                hotel.packages ? (
                  <Badge tone="brand">{hotel.packages.name}</Badge>
                ) : (
                  "—"
                )
              }
            />
            <Info label="สร้างเมื่อ" value={formatDate(hotel.created_at)} />
            <Info label="สกุลเงินหลัก" value={hotel.base_currency} />
            <Info
              label="สถานะ"
              value={
                hotel.is_active ? (
                  <Badge tone="success">ใช้งานอยู่</Badge>
                ) : (
                  <Badge tone="danger">ปิดใช้งาน</Badge>
                )
              }
            />
            <Info
              label="หลายสาขา"
              value={hotel.multi_property ? "เปิด" : "ปิด"}
            />
          </dl>
        </Card>

        {/* ── subscription ── */}
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-fg">
            สถานะการสมัครใช้งาน
          </h2>
          {subscription ? (
            <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
              <Info
                label="สถานะ"
                value={
                  <Badge tone={SUB_STATUS_TONE[subscription.status] ?? "neutral"}>
                    {subscription.status}
                  </Badge>
                }
              />
              <Info
                label="แพ็กเกจ"
                value={subscription.packages?.name ?? "—"}
              />
              <Info
                label="ใช้ได้ถึง"
                value={formatDate(subscription.current_period_end)}
              />
              <Info
                label="ผ่อนผันถึง"
                value={formatDate(subscription.grace_until)}
              />
            </dl>
          ) : (
            <p className="text-sm text-fg-subtle">
              ยังไม่มี subscription (ยังไม่เคยสมัคร/ให้โปรโมชัน)
            </p>
          )}
        </Card>

        {/* ── สมาชิก ── */}
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-fg">
            สมาชิก ({members?.length ?? 0})
          </h2>
          {members && members.length > 0 ? (
            <Table>
              <THead>
                <TR>
                  <TH>ชื่อ</TH>
                  <TH>อีเมล</TH>
                  <TH>บทบาท</TH>
                  <TH className="text-right">เข้าร่วมเมื่อ</TH>
                </TR>
              </THead>
              <TBody>
                {members.map((m) => (
                  <TR key={m.user_id}>
                    <TD>{m.profiles?.full_name ?? "—"}</TD>
                    <TD>
                      <span className="text-fg-muted">
                        {m.profiles?.email ?? "—"}
                      </span>
                    </TD>
                    <TD>
                      <Badge tone="neutral">{m.role}</Badge>
                    </TD>
                    <TD className="text-right">
                      <span className="text-fg-muted">
                        {formatDate(m.joined_at)}
                      </span>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          ) : (
            <p className="text-sm text-fg-subtle">ยังไม่มีสมาชิก</p>
          )}
        </Card>

        {/* ── invoices ── */}
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-fg">
            ใบแจ้งหนี้ล่าสุด
          </h2>
          {invoices && invoices.length > 0 ? (
            <Table>
              <THead>
                <TR>
                  <TH>วันที่</TH>
                  <TH>แพ็กเกจ</TH>
                  <TH>รอบ</TH>
                  <TH className="text-right">ยอด</TH>
                  <TH>สถานะ</TH>
                  <TH className="text-right">จ่ายเมื่อ</TH>
                </TR>
              </THead>
              <TBody>
                {invoices.map((inv) => (
                  <TR key={inv.id}>
                    <TD>
                      <span className="text-fg-muted">
                        {formatDate(inv.created_at)}
                      </span>
                    </TD>
                    <TD>{inv.packages?.name ?? "—"}</TD>
                    <TD>
                      <span className="text-fg-muted">
                        {inv.billing_cycle}
                      </span>
                    </TD>
                    <TD className="text-right">
                      {formatSatang(inv.amount_satang, inv.currency)}
                    </TD>
                    <TD>
                      <Badge tone={INVOICE_STATUS_TONE[inv.status] ?? "neutral"}>
                        {inv.status}
                      </Badge>
                    </TD>
                    <TD className="text-right">
                      <span className="text-fg-muted">
                        {formatDate(inv.paid_at)}
                      </span>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          ) : (
            <p className="text-sm text-fg-subtle">ยังไม่มีใบแจ้งหนี้</p>
          )}
        </Card>
      </div>
    </div>
  );
}

function Info({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs text-fg-subtle">{label}</dt>
      <dd className="mt-0.5 text-sm text-fg">{value}</dd>
    </div>
  );
}
