import { NextResponse, type NextRequest } from "next/server";
import { createMiddlewareClient } from "@/lib/supabase/middleware";
import { requireServerEnv } from "@/lib/supabase/env";
import { getCachedUserFromRequest } from "@/lib/supabase/user-cache";

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

  // authen ผ่าน user-cache (lib/supabase/user-cache.ts — port จาก aoosocial):
  // ตรวจ JWT ในเครื่อง + cache + single-flight + เพดานยิง Supabase
  // ⛔ ห้ามเรียก supabase.auth.getUser() ตรงๆ ที่นี่: โทร auth server ทุก
  // request → ชน rate limit 429 ทั้งเว็บเหมือนโดน logout (bugs.md §Auth)
  // client สร้างแบบ lazy — เคส cache HIT/local verify ไม่แตะ Supabase เลย
  // (สร้างจริงเฉพาะตอน miss ซึ่งเป็นจุด refresh token รายชั่วโมงด้วย)
  const { url: supabaseUrl } = requireServerEnv();
  // เก็บใน object — TS ไม่ track การ assign ผ่าน closure บนตัวแปร let ตรงๆ
  const holder: { mw: ReturnType<typeof createMiddlewareClient> | null } = { mw: null };
  const getMw = () => (holder.mw ??= createMiddlewareClient(request));

  const user = await getCachedUserFromRequest(
    (name) => request.cookies.get(name)?.value ?? null,
    supabaseUrl,
    () => getMw().supabase,
  );

  // server action ที่ auth สะดุดชั่วขณะ (แพ้ refresh race): ห้าม redirect ที่
  // middleware — จะพาผู้ใช้หลุดจากหน้าที่กำลังทำงาน · ปล่อยผ่านให้ guard ใน
  // action ตัดสินเอง (สะดุดชั่วคราว = throw → toast "ลองใหม่" · logout จริง =
  // redirect /login จาก requireUser)
  const isServerAction = request.method === "POST" && request.headers.has("next-action");

  // ยังไม่ login + เข้า path ที่ต้อง auth → ส่งไป /login
  if (!user && !isPublic(pathname) && !isServerAction) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }

  // login แล้วแต่อยู่หน้า / หรือ /login → ส่งไป onboarding
  // ยกเว้น /login?redirect=... — เคส refresh token race: request ที่แพ้ถูกส่งมา
  // /login ทั้งที่ session จริงยังดี (bugs.md §Auth) → ส่งกลับหน้าที่ตั้งใจไปแทน
  // ไม่งั้นผู้ใช้ refresh หน้าไหนก็ตามแล้วโผล่หน้าเลือกโรงแรมแบบงงๆ
  if (user && (pathname === "/" || pathname === "/login")) {
    const url = request.nextUrl.clone();
    const back = pathname === "/login" ? request.nextUrl.searchParams.get("redirect") : null;
    if (back && back.startsWith("/") && !back.startsWith("//")) {
      const target = new URL(back, request.url);
      url.pathname = target.pathname;
      url.search = target.search;
    } else {
      url.pathname = "/onboarding";
      url.search = "";
    }
    return NextResponse.redirect(url);
  }

  // ถ้าเคยสร้าง middleware client (มีการ refresh token) ต้องคืน response ของมัน
  // เพื่อให้ cookie ใหม่ติดไปด้วย — ไม่เคยสร้าง = ผ่านเฉยๆ
  return holder.mw?.response ?? NextResponse.next({ request });
}

export const config = {
  // ⚠️ ต้องยกเว้นไฟล์ static ใน public/ ด้วย — ไม่งั้น proxy จับ /logo.svg แล้ว redirect
  //    ไป /login = รูปไม่ขึ้นทั้งเว็บ (เคยพลาดมาแล้ว — ดู bugs.md)
  //    รูปแบบ: path ที่ลงท้ายด้วยนามสกุลไฟล์ static → ข้าม middleware
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|woff2?)$).*)",
  ],
};
