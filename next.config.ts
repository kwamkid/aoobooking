import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // เพิ่ม remotePatterns ตอนต่อ Supabase Storage (รูปห้อง/สลิป/บัตร)
  images: {
    remotePatterns: [],
  },
};

export default withNextIntl(nextConfig);
