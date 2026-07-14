import { requireHotelMember } from "@/lib/auth";
import { can } from "@/lib/permission";
import { resolveAccess } from "@/lib/package/resolve-access";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card, Button, EmptyState } from "@/components/ui";
import { PropertyForm } from "./property-form";
import { deleteProperty } from "./actions";

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
  searchParams,
}: {
  searchParams: Promise<{ h?: string }>;
}) {
  const { h } = await searchParams;
  const { hotel } = await requireHotelMember(h);
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

  const atLimit =
    access.maxProperties !== null && properties.length >= access.maxProperties;

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-8">
      <PageHeader
        title="สาขา"
        subtitle={`${hotel.name} · ${properties.length}${
          access.maxProperties !== null ? `/${access.maxProperties}` : ""
        } สาขา`}
      />

      {properties.length === 0 && (
        <EmptyState
          art="bed"
          title="ยังไม่มีสาขา"
          description="เพิ่มสาขาแรกด้านล่าง"
        />
      )}

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
                      <form action={deleteProperty} className="mt-3">
                        <input type="hidden" name="hotelSlug" value={hotel.slug} />
                        <input type="hidden" name="propertyId" value={p.id} />
                        <Button variant="danger" size="sm">
                          ปิดสาขานี้
                        </Button>
                      </form>
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
        </div>
      )}
    </div>
  );
}
