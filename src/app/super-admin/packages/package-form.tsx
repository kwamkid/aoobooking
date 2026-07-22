"use client";

import { useState, useTransition } from "react";
import {
  Modal,
  Field,
  Input,
  Button,
  Badge,
  DataTable,
  EmptyState,
  useToast,
  type DataTableColumn,
} from "@/components/ui";
import { updatePackage } from "./actions";
import { isNextControlFlowError } from "@/lib/next-error";

/* ============================================================================
 *  PackageTable — ตาราง 5 tiers + ปุ่มแก้รายแถว
 *  PackageForm  — modal แก้แพ็กเกจ (ราคา/limit/feature flags/สถานะ)
 *  null ใน max_* = ไม่จำกัด · null ใน price = ติดต่อฝ่ายขาย
 * ========================================================================== */

export interface PackageRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  max_properties: number | null;
  max_rooms: number | null;
  max_team_members: number | null;
  max_ota_channels: number | null;
  allow_booking_engine: boolean;
  allow_channel_manager: boolean;
  allow_dynamic_pricing: boolean;
  allow_advanced_reports: boolean;
  allow_custom_domain: boolean;
  allow_monthly_rental: boolean;
  remove_branding: boolean;
  price_thb_monthly: number | null;
  price_thb_yearly: number | null;
  is_active: boolean;
  is_public: boolean;
  sort_order: number;
}

const numberFmt = new Intl.NumberFormat("th-TH");

/** null = ไม่จำกัด */
function limitText(v: number | null) {
  return v == null ? "ไม่จำกัด" : numberFmt.format(v);
}

/** number|null → string สำหรับ input (null = ว่าง) */
function toInput(v: number | null) {
  return v == null ? "" : String(v);
}

/** string → number|null (ว่าง = null = ไม่จำกัด) */
function toNumberOrNull(v: string) {
  return v.trim() ? Number(v) : null;
}

const FEATURES = [
  { key: "allowBookingEngine", label: "Booking Engine (หน้าจองของโรงแรมเอง)" },
  { key: "allowChannelManager", label: "Channel Manager (เชื่อม OTA)" },
  { key: "allowDynamicPricing", label: "Dynamic Pricing (ปรับราคาอัตโนมัติ)" },
  { key: "allowAdvancedReports", label: "รายงานขั้นสูง" },
  { key: "allowCustomDomain", label: "Custom Domain" },
  { key: "allowMonthlyRental", label: "โมดูลเช่ารายเดือน (ผู้เช่า + สัญญา)" },
  { key: "removeBranding", label: "ซ่อนแบรนด์ AooBooking" },
] as const;

type FeatureKey = (typeof FEATURES)[number]["key"];

type FormState = {
  name: string;
  priceThbMonthly: string;
  maxProperties: string;
  maxRooms: string;
  maxTeamMembers: string;
  maxOtaChannels: string;
  isActive: boolean;
} & Record<FeatureKey, boolean>;

function toForm(p: PackageRow): FormState {
  return {
    name: p.name,
    priceThbMonthly: toInput(p.price_thb_monthly),
    maxProperties: toInput(p.max_properties),
    maxRooms: toInput(p.max_rooms),
    maxTeamMembers: toInput(p.max_team_members),
    maxOtaChannels: toInput(p.max_ota_channels),
    allowBookingEngine: p.allow_booking_engine,
    allowChannelManager: p.allow_channel_manager,
    allowDynamicPricing: p.allow_dynamic_pricing,
    allowAdvancedReports: p.allow_advanced_reports,
    allowCustomDomain: p.allow_custom_domain,
    allowMonthlyRental: p.allow_monthly_rental,
    removeBranding: p.remove_branding,
    isActive: p.is_active,
  };
}

export function PackageForm({
  pkg,
  open,
  onClose,
}: {
  pkg: PackageRow;
  open: boolean;
  onClose: () => void;
}) {
  const [form, setForm] = useState<FormState>(() => toForm(pkg));
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function submit() {
    startTransition(async () => {
      try {
        await updatePackage({
          id: pkg.id,
          name: form.name,
          priceThbMonthly: toNumberOrNull(form.priceThbMonthly),
          maxProperties: toNumberOrNull(form.maxProperties),
          maxRooms: toNumberOrNull(form.maxRooms),
          maxTeamMembers: toNumberOrNull(form.maxTeamMembers),
          maxOtaChannels: toNumberOrNull(form.maxOtaChannels),
          allowBookingEngine: form.allowBookingEngine,
          allowChannelManager: form.allowChannelManager,
          allowDynamicPricing: form.allowDynamicPricing,
          allowAdvancedReports: form.allowAdvancedReports,
          allowCustomDomain: form.allowCustomDomain,
          allowMonthlyRental: form.allowMonthlyRental,
          removeBranding: form.removeBranding,
          isActive: form.isActive,
        });
        toast.ok("บันทึกแล้ว");
        onClose();
      } catch (e) {
        if (isNextControlFlowError(e)) throw e; // ปล่อย redirect/notFound ให้ Next
        toast.err(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
      }
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`แก้แพ็กเกจ · ${pkg.name}`}
      description={pkg.slug}
      maxWidth={560}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            ยกเลิก
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? "กำลังบันทึก…" : "บันทึก"}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="rounded-(--radius) bg-warning-soft p-3">
          <p className="text-sm text-warning-strong">
            ⚠️ แก้แล้วมีผลกับ<b>ทุกโรงแรมใน tier นี้ทันที</b>
          </p>
        </div>

        <Field label="ชื่อแพ็กเกจ">
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} required />
        </Field>

        <Field label="ราคา/เดือน (บาท)">
          <Input
            type="number"
            min={0}
            step={1}
            value={form.priceThbMonthly}
            onChange={(e) => set("priceThbMonthly", e.target.value)}
            placeholder="เว้นว่าง = ติดต่อฝ่ายขาย"
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="จำนวนสาขา">
            <Input
              type="number"
              min={0}
              step={1}
              value={form.maxProperties}
              onChange={(e) => set("maxProperties", e.target.value)}
              placeholder="ไม่จำกัด"
            />
          </Field>
          <Field label="จำนวนห้อง">
            <Input
              type="number"
              min={0}
              step={1}
              value={form.maxRooms}
              onChange={(e) => set("maxRooms", e.target.value)}
              placeholder="ไม่จำกัด"
            />
          </Field>
          <Field label="จำนวนสมาชิกทีม">
            <Input
              type="number"
              min={0}
              step={1}
              value={form.maxTeamMembers}
              onChange={(e) => set("maxTeamMembers", e.target.value)}
              placeholder="ไม่จำกัด"
            />
          </Field>
          <Field label="จำนวนช่องทาง OTA">
            <Input
              type="number"
              min={0}
              step={1}
              value={form.maxOtaChannels}
              onChange={(e) => set("maxOtaChannels", e.target.value)}
              placeholder="ไม่จำกัด"
            />
          </Field>
        </div>
        <p className="-mt-2 text-xs text-fg-subtle">เว้นว่าง = ไม่จำกัด</p>

        <Field label="ฟีเจอร์">
          <div className="flex flex-col gap-2 rounded-(--radius) bg-bg-subtle p-3">
            {FEATURES.map((f) => (
              <label key={f.key} className="flex items-center gap-2 text-sm text-fg">
                <input
                  type="checkbox"
                  checked={form[f.key]}
                  onChange={(e) => set(f.key, e.target.checked)}
                />
                <span>{f.label}</span>
              </label>
            ))}
          </div>
        </Field>

        <div className="rounded-(--radius) bg-bg-subtle p-3">
          <label className="flex items-center gap-2 text-sm text-fg">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => set("isActive", e.target.checked)}
            />
            <span>
              <b>เปิดขาย</b> (ไม่ติ๊ก = ปิด — โรงแรมใหม่เลือกแพ็กเกจนี้ไม่ได้)
            </span>
          </label>
        </div>
      </form>
    </Modal>
  );
}

function EditPackageButton({ pkg }: { pkg: PackageRow }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        แก้
      </Button>
      {/* remount ทุกครั้งที่เปิด → form state เริ่มจากค่าล่าสุดเสมอ */}
      {open && <PackageForm key={pkg.id} pkg={pkg} open={open} onClose={() => setOpen(false)} />}
    </>
  );
}

export function PackageTable({ rows }: { rows: PackageRow[] }) {
  const columns: DataTableColumn<PackageRow>[] = [
    {
      key: "name",
      header: "ชื่อ",
      render: (r) => (
        <span className="flex flex-col">
          <span className="font-medium text-fg">{r.name}</span>
          <span className="font-mono text-xs text-fg-subtle">{r.slug}</span>
        </span>
      ),
    },
    {
      key: "price_thb_monthly",
      header: "ราคา/เดือน",
      align: "right",
      render: (r) =>
        r.price_thb_monthly == null ? (
          <span className="text-fg-subtle">—</span>
        ) : (
          <span className="text-fg">{numberFmt.format(r.price_thb_monthly)}฿</span>
        ),
    },
    {
      key: "max_properties",
      header: "สาขา",
      align: "right",
      render: (r) => <span className="text-fg-muted">{limitText(r.max_properties)}</span>,
    },
    {
      key: "max_rooms",
      header: "ห้อง",
      align: "right",
      render: (r) => <span className="text-fg-muted">{limitText(r.max_rooms)}</span>,
    },
    {
      key: "max_team_members",
      header: "สมาชิก",
      align: "right",
      render: (r) => <span className="text-fg-muted">{limitText(r.max_team_members)}</span>,
    },
    {
      key: "max_ota_channels",
      header: "OTA",
      align: "right",
      render: (r) => <span className="text-fg-muted">{limitText(r.max_ota_channels)}</span>,
    },
    {
      key: "is_active",
      header: "สถานะ",
      render: (r) => (
        <span className="flex flex-wrap items-center gap-1">
          <Badge tone={r.is_active ? "success" : "neutral"}>
            {r.is_active ? "เปิดขาย" : "ปิด"}
          </Badge>
          {!r.is_public && <Badge tone="info">invite-only</Badge>}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (r) => <EditPackageButton pkg={r} />,
    },
  ];

  return (
    <DataTable<PackageRow>
      columns={columns}
      data={rows}
      keyField="id"
      emptyState={<EmptyState art="receipt" title="ยังไม่มีแพ็กเกจ" />}
    />
  );
}
