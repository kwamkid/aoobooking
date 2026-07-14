import { requireHotelMember } from "@/lib/auth";
import { can } from "@/lib/permission";
import { resolveAccess } from "@/lib/package/resolve-access";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card, Button, EmptyState, DeleteButton } from "@/components/ui";
import { PropertyForm } from "./property-form";
import { deleteProperty, toggleMultiProperty } from "./actions";

type Property = {
  id: string;
  slug: string;
  name: string;
  address: string | null;
  phone: string | null;
  timezone: string;
  check_in_time: string;
  check_out_time: string;
  vat_percent: number;
  service_charge_percent: number;
  tax_inclusive: boolean;
};

export default async function PropertiesPage({
  params,
}: {
  params: Promise<{ hotel: string }>;
}) {
  const { hotel: hotelSlug } = await params;
  const { hotel } = await requireHotelMember(hotelSlug);
  const canEdit = await can(hotel.id, "settings.properties");
  const access = await resolveAccess(hotel.id);

  const supabase = await createClient();
  const { data } = await supabase
    .from("properties")
    .select(
      "id, slug, name, address, phone, timezone, check_in_time, check_out_time, " +
        "vat_percent, service_charge_percent, tax_inclusive",
    )
    .eq("hotel_id", hotel.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  const properties = (data ?? []) as unknown as Property[];

  const multi = hotel.multi_property;
  const main = properties[0];

  // ── โหมดสาขาเดียว: โชว์ตั้งค่าโรงแรม (สาขาหลัก) ตรงๆ + ปุ่มเปิดหลายสาขา ──
  if (!multi) {
    return (
      <div className="p-4 sm:p-8">
        <PageHeader
          title="ตั้งค่าโรงแรม"
          subtitle={hotel.name}
        />
        {main ? (
          <Card>
            {canEdit ? (
              <PropertyForm hotelSlug={hotel.slug} property={main} />
            ) : (
              <p className="text-sm text-fg-muted">คุณไม่มีสิทธิ์แก้ไข</p>
            )}
          </Card>
        ) : (
          <EmptyState art="bed" title="กำลังเตรียมข้อมูลโรงแรม…" />
        )}

        {canEdit && (
          <Card className="mt-6">
            <h2 className="font-semibold text-fg">มีหลายสาขา?</h2>
            <p className="mt-1 text-sm text-fg-muted">
              ถ้าโรงแรมของคุณมีหลายสาขา/หลายที่ เปิดโหมดนี้เพื่อจัดการแต่ละสาขาแยกกัน
            </p>
            <form action={toggleMultiProperty} className="mt-3">
              <input type="hidden" name="hotelSlug" value={hotel.slug} />
              <input type="hidden" name="enable" value="true" />
              <Button variant="secondary" type="submit">
                เปิดโหมดหลายสาขา
              </Button>
            </form>
          </Card>
        )}
      </div>
    );
  }

  // ── โหมดหลายสาขา: ลิสต์ + เพิ่มสาขา ──
  const atLimit =
    access.maxProperties !== null && properties.length >= access.maxProperties;

  return (
    <div className="p-4 sm:p-8">
      <PageHeader
        title="สาขา"
        subtitle={`${hotel.name} · ${properties.length}${
          access.maxProperties !== null ? `/${access.maxProperties}` : ""
        } สาขา`}
      />

      <ul className="space-y-3">
        {properties.map((p) => (
          <li key={p.id}>
            <Card pad={false}>
              <details className="p-4">
                <summary className="cursor-pointer font-medium text-fg">
                  {p.name}{" "}
                  <span className="font-mono text-xs text-fg-subtle">/{p.slug}</span>
                  <span className="ml-2 text-xs text-fg-muted">
                    VAT {p.vat_percent}% · SC {p.service_charge_percent}% ·{" "}
                    {p.tax_inclusive ? "ราคารวมภาษี" : "ราคายังไม่รวมภาษี"}
                  </span>
                </summary>
                <div className="mt-4">
                  {canEdit ? (
                    <>
                      <PropertyForm hotelSlug={hotel.slug} property={p} />
                      {properties.length > 1 && (
                        <div className="mt-3">
                          <DeleteButton
                            action={deleteProperty}
                            hiddenFields={{ hotelSlug: hotel.slug, propertyId: p.id }}
                            label="ปิดสาขานี้"
                            confirmTitle={`ปิดสาขา "${p.name}"?`}
                            confirmDescription="สาขานี้จะถูกซ่อน (ข้อมูลยังอยู่) — เปิดกลับได้ภายหลัง"
                            successMessage="ปิดสาขาแล้ว"
                          />
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-fg-muted">คุณไม่มีสิทธิ์แก้ไขสาขา</p>
                  )}
                </div>
              </details>
            </Card>
          </li>
        ))}
      </ul>

      {canEdit && (
        <div className="mt-8 border-t border-border pt-6">
          <h2 className="mb-3 text-lg font-semibold text-fg">เพิ่มสาขาใหม่</h2>
          {atLimit ? (
            <p className="rounded-lg bg-warning-soft p-4 text-sm text-warning">
              ถึงขีดจำกัดสาขาของแพ็กเกจ {access.packageName} แล้ว — อัพเกรดเพื่อเพิ่มสาขา
            </p>
          ) : (
            <PropertyForm hotelSlug={hotel.slug} />
          )}

          {/* ปิดโหมดหลายสาขา (ได้เฉพาะเหลือสาขาเดียว) */}
          {properties.length === 1 && (
            <form action={toggleMultiProperty} className="mt-6">
              <input type="hidden" name="hotelSlug" value={hotel.slug} />
              <input type="hidden" name="enable" value="false" />
              <Button variant="ghost" size="sm" type="submit">
                ปิดโหมดหลายสาขา (กลับเป็นโรงแรมที่เดียว)
              </Button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
