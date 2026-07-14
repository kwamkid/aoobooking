"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { requireBrowserEnv } from "./env";

/** Supabase client สำหรับ Client Components */
export function createClient() {
  const { url, publishableKey } = requireBrowserEnv();
  return createBrowserClient<Database>(url, publishableKey);
}
