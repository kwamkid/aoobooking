import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { requireSecretEnv } from "./env";

/**
 * Admin (secret-key) Supabase client
 *
 * ⚠️ BYPASS RLS — ใช้เฉพาะ:
 *   - Cron handlers (night audit, downgrade, sync)
 *   - Webhooks (Beam, OTA)
 *   - Server actions ที่ต้องทำงานในนาม "ระบบ" จริงๆ
 *
 * ห้ามส่งเข้า Client Component และห้าม log key เด็ดขาด
 */
export function createAdminClient() {
  const { url, secretKey } = requireSecretEnv();
  return createClient<Database>(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
