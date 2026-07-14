import { notFound } from "next/navigation";
import {
  Button,
  ButtonLink,
  Card,
  Field,
  Input,
  Select,
  Textarea,
  SearchBox,
  Badge,
  PageHeader,
  EmptyState,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
  ThemeToggle,
} from "@/components/ui";
import { ThemePanel } from "./theme-panel";
import { ToastDemo, ModalDemo, PickerDemo, DataTableDemo } from "./interactive-demos";

// ============================================================================
// /design — Design System showcase (DEV เท่านั้น)
// ดู + ปรับ palette/token/component ที่เดียว · block production
// แก้สีจริง → src/app/globals.css (design tokens)
// ============================================================================

export const metadata = { title: "Design System — AooBooking" };

// palette แสดงผล (ชื่อ + CSS var)
const BRAND_COLORS = [
  { name: "แดง-ส้ม (brand)", var: "--c-red", soft: "--c-red-soft" },
  { name: "ส้ม", var: "--c-orange", soft: "--c-orange-soft" },
  { name: "เหลือง", var: "--c-yellow", soft: "--c-yellow-soft" },
  { name: "เขียว", var: "--c-green", soft: "--c-green-soft" },
  { name: "ม่วง", var: "--c-purple", soft: "--c-purple-soft" },
];
const SEMANTIC = [
  { name: "brand", var: "--brand" },
  { name: "success", var: "--success" },
  { name: "warning", var: "--warning" },
  { name: "danger", var: "--danger" },
  { name: "info", var: "--info" },
];
const NEUTRALS = [0, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900];
const ARTS = ["bed", "calendar", "guest", "search", "receipt"] as const;

export default function DesignSystemPage() {
  // dev เท่านั้น
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-8">
      <PageHeader
        title="Design System"
        subtitle="ดู + ปรับ palette/token/component ที่เดียว · แก้สีจริงที่ src/app/globals.css (dev เท่านั้น)"
        action={<ThemeToggle />}
      />

      {/* ---- Light vs Dark เทียบคู่ ---- */}
      <Section title="Light / Dark เทียบคู่">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {(["light", "dark"] as const).map((t) => (
            <ThemePanel key={t} theme={t}>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-fg">โรงแรมของฉัน</h3>
                  <Badge tone="brand">Pro</Badge>
                </div>
                <p className="text-sm text-fg-muted">
                  ตัวอย่างการ์ด + ปุ่ม + ฟอร์ม ในโหมด {t === "light" ? "สว่าง" : "มืด"}
                </p>
                <Field label="ชื่อสาขา">
                  <Input placeholder="สาขาหลัก" />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <Badge tone="success">ว่าง</Badge>
                  <Badge tone="warning">ใกล้เต็ม</Badge>
                  <Badge tone="danger">เต็ม</Badge>
                  <Badge tone="info">จองแล้ว</Badge>
                </div>
                <div className="flex gap-2">
                  <Button size="sm">บันทึก</Button>
                  <Button size="sm" variant="secondary">
                    ยกเลิก
                  </Button>
                </div>
              </div>
            </ThemePanel>
          ))}
        </div>
        <p className="mt-2 text-xs text-fg-subtle">
          กล่องบังคับ theme ในตัว (ไม่ขึ้นกับปุ่มด้านบน) — ปรับ token ใน globals.css แล้วเทียบ 2
          โหมดพร้อมกัน
        </p>
      </Section>

      {/* ---- Palette ---- */}
      <Section title="Brand Palette">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {BRAND_COLORS.map((c) => (
            <div key={c.var} className="overflow-hidden rounded-lg border border-border">
              <div className="h-16" style={{ background: `var(${c.var})` }} />
              <div className="h-6" style={{ background: `var(${c.soft})` }} />
              <div className="p-2">
                <div className="text-xs font-medium text-fg">{c.name}</div>
                <code className="text-[10px] text-fg-subtle">{c.var}</code>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ---- Semantic ---- */}
      <Section title="Semantic Tokens">
        <div className="flex flex-wrap gap-3">
          {SEMANTIC.map((c) => (
            <div key={c.var} className="flex items-center gap-2 rounded-lg border border-border p-2">
              <span
                className="inline-block h-8 w-8 rounded"
                style={{ background: `var(${c.var})` }}
              />
              <div>
                <div className="text-xs font-medium text-fg">{c.name}</div>
                <code className="text-[10px] text-fg-subtle">{c.var}</code>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ---- Neutrals ---- */}
      <Section title="Neutral Scale">
        <div className="flex flex-wrap gap-1">
          {NEUTRALS.map((n) => (
            <div key={n} className="text-center">
              <span
                className="block h-10 w-10 rounded border border-border"
                style={{ background: `var(--c-neutral-${n})` }}
              />
              <code className="text-[10px] text-fg-subtle">{n}</code>
            </div>
          ))}
        </div>
      </Section>

      {/* ---- Typography — base 16px ---- */}
      <Section title="Typography — IBM Plex Sans Thai (base 16px)">
        <div className="space-y-2">
          <TypeRow cls="text-3xl font-bold" size="30px" label="Heading 3xl" />
          <TypeRow cls="text-2xl font-bold" size="24px" label="Heading 2xl" />
          <TypeRow cls="text-xl font-semibold" size="20px" label="Heading xl" />
          <TypeRow cls="text-lg font-semibold" size="18px" label="Subhead lg" />
          <TypeRow cls="text-base" size="16px ★ regular" label="Body (ฐาน)" />
          <TypeRow cls="text-sm text-fg-muted" size="14px" label="Small / muted" />
          <TypeRow cls="text-xs text-fg-subtle" size="12px" label="Meta / label" />
        </div>
        <div className="mt-3 flex flex-wrap gap-3 text-fg">
          <span className="font-light">Light 300</span>
          <span className="font-normal">Regular 400</span>
          <span className="font-medium">Medium 500</span>
          <span className="font-semibold">Semibold 600</span>
          <span className="font-bold">Bold 700</span>
        </div>
      </Section>

      {/* ---- Buttons ---- */}
      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button disabled>Disabled</Button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">Large</Button>
          <ButtonLink href="#" variant="secondary">
            ButtonLink
          </ButtonLink>
        </div>
      </Section>

      {/* ---- Badges ---- */}
      <Section title="Badges">
        <div className="flex flex-wrap gap-2">
          <Badge tone="neutral">neutral</Badge>
          <Badge tone="brand">brand</Badge>
          <Badge tone="success">success</Badge>
          <Badge tone="warning">warning</Badge>
          <Badge tone="danger">danger</Badge>
          <Badge tone="info">info</Badge>
        </div>
      </Section>

      {/* ---- Inputs ---- */}
      <Section title="Form Controls — สูงเท่ากัน 40px · font 16px">
        {/* แถวเรียงกันโชว์ว่า input/select/button สูงเท่ากันเป๊ะ */}
        <div className="flex flex-wrap items-end gap-2">
          <Input placeholder="input" className="w-40" />
          <Select
            className="w-40"
            defaultValue="select"
            options={[{ value: "select", label: "select" }]}
          />
          <Button>ปุ่ม</Button>
          <Button variant="secondary">secondary</Button>
        </div>

        <div className="mt-4 grid max-w-lg grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Input">
            <Input placeholder="พิมพ์ข้อความ…" />
          </Field>
          <Field label="Select">
            <Select
              defaultValue="1"
              options={[
                { value: "1", label: "ตัวเลือก 1" },
                { value: "2", label: "ตัวเลือก 2" },
              ]}
            />
          </Field>
          <Field label="SearchBox" className="sm:col-span-2">
            <SearchBox placeholder="ค้นหา…" />
          </Field>
          <Field label="Textarea (ยืดได้ · font 16px)" className="sm:col-span-2">
            <Textarea rows={2} placeholder="ข้อความยาว…" />
          </Field>
        </div>
      </Section>

      {/* ---- Cards ---- */}
      <Section title="Cards">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Card>
            <h3 className="font-semibold text-fg">Card</h3>
            <p className="mt-1 text-sm text-fg-muted">กล่อง surface มาตรฐาน</p>
          </Card>
          <Card>
            <h3 className="font-semibold text-fg">Card อีกใบ</h3>
            <p className="mt-1 text-sm text-fg-muted">ใช้ห่อเนื้อหาเป็นกลุ่ม</p>
          </Card>
        </div>
      </Section>

      {/* ---- Table ---- */}
      <Section title="Table">
        <Table>
          <THead>
            <TR>
              <TH>โค้ด</TH>
              <TH>แขก</TH>
              <TH>สถานะ</TH>
              <TH className="text-right">ยอด</TH>
            </TR>
          </THead>
          <TBody>
            <TR>
              <TD className="font-mono">BK-A1B2C3</TD>
              <TD>สมชาย ใจดี</TD>
              <TD>
                <Badge tone="success">checked_in</Badge>
              </TD>
              <TD className="text-right font-medium">2,500฿</TD>
            </TR>
            <TR>
              <TD className="font-mono">BK-X9Y8Z7</TD>
              <TD>สมหญิง รักสงบ</TD>
              <TD>
                <Badge tone="warning">pending</Badge>
              </TD>
              <TD className="text-right font-medium">1,200฿</TD>
            </TR>
          </TBody>
        </Table>
      </Section>

      {/* ---- Toast ---- */}
      <Section title="Toast — มุมขวาบน · auto-hide 4s">
        <ToastDemo />
      </Section>

      {/* ---- Modal + ConfirmDialog ---- */}
      <Section title="Modal & ConfirmDialog">
        <ModalDemo />
      </Section>

      {/* ---- Date & Time Pickers ---- */}
      <Section title="Date & Time Pickers — hand-rolled (พิมพ์เวลา '930' → 09:30)">
        <PickerDemo />
      </Section>

      {/* ---- DataTable + Pagination ---- */}
      <Section title="DataTable — sort ไทย (คลิกหัวคอลัมน์) + Pagination">
        <DataTableDemo />
      </Section>

      {/* ---- EmptyState + SVG art ---- */}
      <Section title="EmptyState — SVG minimal outline art">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ARTS.map((art) => (
            <EmptyState
              key={art}
              art={art}
              title={`art="${art}"`}
              description="ภาพ minimal outline (currentColor)"
            />
          ))}
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="mb-3 text-lg font-semibold text-fg">{title}</h2>
      {children}
    </section>
  );
}

function TypeRow({ cls, size, label }: { cls: string; size: string; label: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <code className="w-28 shrink-0 text-xs text-fg-subtle">{size}</code>
      <span className={`${cls.includes("text-fg") ? cls : `${cls} text-fg`}`}>
        {label} — โรงแรมจองห้องพัก ABC 123
      </span>
    </div>
  );
}
