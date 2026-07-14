import { requireHotelMember } from "@/lib/auth";
import { can } from "@/lib/permission";
import { resolveAccess } from "@/lib/package/resolve-access";
import { createClient } from "@/lib/supabase/server";
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
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="text-2xl font-bold">สาขา</h1>
      <p className="mt-1 text-neutral-500">
        {hotel.name} · {properties.length}
        {access.maxProperties !== null ? `/${access.maxProperties}` : ""} สาขา
      </p>

      {properties.length === 0 && (
        <div className="mt-6 rounded-lg border border-dashed border-neutral-300 p-8 text-center text-neutral-400 dark:border-neutral-700">
          ยังไม่มีสาขา — เพิ่มสาขาแรกด้านล่าง
        </div>
      )}

      <ul className="mt-6 space-y-3">
        {properties.map((p) => (
          <li
            key={p.id}
            className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
          >
            <details>
              <summary className="cursor-pointer font-medium">
                {p.name}{" "}
                <span className="font-mono text-xs text-neutral-400">/{p.slug}</span>
                <span className="ml-2 text-xs text-neutral-500">
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
                      <button className="text-sm text-red-600 underline">
                        ปิดสาขานี้
                      </button>
                    </form>
                  </>
                ) : (
                  <p className="text-sm text-neutral-400">คุณไม่มีสิทธิ์แก้ไขสาขา</p>
                )}
              </div>
            </details>
          </li>
        ))}
      </ul>

      {canEdit && (
        <div className="mt-8 border-t border-neutral-200 pt-6 dark:border-neutral-800">
          <h2 className="mb-3 text-lg font-semibold">เพิ่มสาขาใหม่</h2>
          {atLimit ? (
            <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-700 dark:bg-amber-950/30">
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
