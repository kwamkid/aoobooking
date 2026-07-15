import { NextResponse, type NextRequest } from "next/server";
import { createMiddlewareClient } from "@/lib/supabase/middleware";

// Next 16 middleware = proxy.ts export proxy() (ไม่ใช่ middleware.ts)

// path สาธารณะ (ไม่ต้อง login)
const PUBLIC_EXACT = new Set<string>(["/", "/login", "/no-access", "/design"]);
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

// URL structure (2026-07-15): tenant อยู่ใน path — /[hotel]/dashboard = หลังบ้าน (auth)
// หลังบ้าน PMS ทั้งหมดอยู่ใต้ (app)/[hotel]/* → non-public → proxy บังคับ login อัตโนมัติ
// TODO(Phase 3 booking engine): /[hotel] เปล่าๆ (public) = หน้าบ้านจอง → ต้องเพิ่ม
//   logic แยก: ถ้า path = /[slug] (ไม่มี segment หลัง) หรือ /[slug]/booking → public
//   ตอนนั้น check ว่า slug มีจริง + ปล่อย anon read (RLS anon policy)

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
  // ⚠️ ต้องยกเว้นไฟล์ static ใน public/ ด้วย — ไม่งั้น proxy จับ /logo.svg แล้ว redirect
  //    ไป /login = รูปไม่ขึ้นทั้งเว็บ (เคยพลาดมาแล้ว — ดู bugs.md)
  //    รูปแบบ: path ที่ลงท้ายด้วยนามสกุลไฟล์ static → ข้าม middleware
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|woff2?)$).*)",
  ],
};
