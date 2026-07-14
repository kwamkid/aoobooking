import { NextResponse, type NextRequest } from "next/server";
import { createMiddlewareClient } from "@/lib/supabase/middleware";

// Next 16 middleware = proxy.ts export proxy() (ไม่ใช่ middleware.ts)

// path สาธารณะ (ไม่ต้อง login)
const PUBLIC_EXACT = new Set<string>(["/", "/login", "/no-access"]);
const PUBLIC_PREFIXES = [
  "/auth/", // OAuth callback / sign-out
  "/invite/", // รับคำเชิญ
  "/api/webhooks/", // Beam / OTA
  "/api/cron/", // cron jobs
  "/_next/",
  "/favicon",
];

function isPublic(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

// booking engine หน้าบ้าน = public (/[hotelSlug] และ /[hotelSlug]/[property])
// จับด้วย prefix แยก: หน้าหลังบ้านอยู่ใต้ (app) group จึงเป็น path ปกติ
// ที่นี่ปล่อย path ที่ไม่ใช่ระบบหลังบ้าน/superadmin ให้ผ่านได้ (ปรับตอนมี booking engine)

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const { supabase, response } = createMiddlewareClient(request);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ยังไม่ login + เข้า path ที่ต้อง auth → ส่งไป /login
  if (!user && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }

  // login แล้วแต่อยู่หน้า / หรือ /login → ส่งไป onboarding
  if (user && (pathname === "/" || pathname === "/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/onboarding";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
