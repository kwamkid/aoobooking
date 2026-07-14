import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";
import { requireServerEnv } from "./env";

/**
 * Supabase client ต่อ request ใช้ใน middleware (proxy.ts)
 * คืนทั้ง client + response เพื่อให้ caller แนบ cookie ที่อัปเดตกลับได้
 */
export function createMiddlewareClient(request: NextRequest) {
  const { url, publishableKey } = requireServerEnv();

  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  return { supabase, response };
}
