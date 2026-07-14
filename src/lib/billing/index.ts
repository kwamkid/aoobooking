import "server-only";
import { createClient } from "@/lib/supabase/server";

export type Package = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  max_properties: number | null;
  max_rooms: number | null;
  max_team_members: number | null;
  max_ota_channels: number | null;
  price_thb_monthly: number | null;
  price_thb_yearly: number | null;
  is_public: boolean;
  sort_order: number;
};

export type Subscription = {
  id: string;
  hotel_id: string;
  package_id: string;
  billing_cycle: "monthly" | "yearly";
  status: "active" | "grace" | "expired" | "canceled";
  current_period_end: string;
  grace_until: string | null;
  scheduled_package_id: string | null;
  scheduled_cycle: "monthly" | "yearly" | null;
};

export const GRACE_DAYS = 7;
export const VAT_PERCENT = 7;

/** ราคา (บาท) ของ package ตาม cycle — null = ไม่มีขาย (free/enterprise) */
export function priceTHB(pkg: Package, cycle: "monthly" | "yearly") {
  return cycle === "yearly" ? pkg.price_thb_yearly : pkg.price_thb_monthly;
}

/** แตกยอด VAT จากราคารวม (tax-inclusive): 1070 → base 1000 + vat 70 (หน่วย satang) */
export function splitVatInclusiveSatang(totalSatang: number) {
  const vat = Math.round((totalSatang * VAT_PERCENT) / (100 + VAT_PERCENT));
  return { baseSatang: totalSatang - vat, vatSatang: vat };
}

export async function listPublicPackages(): Promise<Package[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("packages")
    .select("*")
    .eq("is_active", true)
    .eq("is_public", true)
    .order("sort_order");
  return (data ?? []) as Package[];
}

export async function getSubscription(
  hotelId: string,
): Promise<Subscription | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("hotel_id", hotelId)
    .maybeSingle();
  return data as Subscription | null;
}
