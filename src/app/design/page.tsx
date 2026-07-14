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
} from "@/components/ui";

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
      />

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

      {/* ---- Typography ---- */}
      <Section title="Typography — IBM Plex Sans Thai">
        <div className="space-y-2">
          <p className="text-3xl font-bold text-fg">พาดหัวใหญ่ Heading 3xl ABC 123</p>
          <p className="text-2xl font-bold text-fg">หัวข้อ Heading 2xl ABC 123</p>
          <p className="text-lg font-semibold text-fg">หัวข้อย่อย Semibold lg</p>
          <p className="text-base text-fg">ข้อความปกติ Body — โรงแรมจองห้องพัก The quick brown fox</p>
          <p className="text-sm text-fg-muted">ข้อความรอง (muted) — คำอธิบายเพิ่มเติม</p>
          <p className="text-xs text-fg-subtle">ข้อความจาง (subtle) — meta / label</p>
          <div className="flex gap-3 text-fg">
            <span className="font-light">Light 300</span>
            <span className="font-normal">Regular 400</span>
            <span className="font-medium">Medium 500</span>
            <span className="font-semibold">Semibold 600</span>
            <span className="font-bold">Bold 700</span>
          </div>
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
      <Section title="Form Controls">
        <div className="grid max-w-lg grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Input">
            <Input placeholder="พิมพ์ข้อความ…" />
          </Field>
          <Field label="Select">
            <Select>
              <option>ตัวเลือก 1</option>
              <option>ตัวเลือก 2</option>
            </Select>
          </Field>
          <Field label="SearchBox" className="sm:col-span-2">
            <SearchBox placeholder="ค้นหา…" />
          </Field>
          <Field label="Textarea" className="sm:col-span-2">
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
