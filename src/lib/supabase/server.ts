import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";
import { requireServerEnv } from "./env";

/**
 * Supabase client สำหรับ Server Components / Route Handlers / Server Actions
 * อ่าน/เขียน auth cookie ผ่าน next/headers — สร้างใหม่ต่อ request เสมอ
 */
export async function createClient() {
  const { url, publishableKey } = requireServerEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // ถูกเรียกจาก Server Component (อ่าน session) — middleware จะ refresh cookie เอง
        }
      },
    },
  });
}
