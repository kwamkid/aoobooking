import "server-only";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { requireServerEnv } from "./env";

/* ============================================================================
 * user-cache — ชั้น authen กลางของทั้งแอป (port จาก aoosocial 2026-07-24)
 *
 * ทำไมต้องมี: `auth.getUser()` โทรหา Supabase auth server ทุกครั้งที่เรียก
 * — proxy ทุก request + guard ทุกหน้า → ชน rate limit 429 ทั้งเว็บเหมือนโดน
 * logout (bugs.md §Auth 2026-07-24) · `getSession()` ก็ไม่ฟรี: ใกล้หมดอายุ
 * มันแอบ refresh ผ่าน /auth/v1/token ซึ่งมี rate limit แยกและโหดกว่า
 *
 * ชั้นป้องกัน (เรียงตามลำดับที่ทำงาน):
 *  1. อ่าน access token ตรงจาก cookie (ไม่ผ่าน getSession — ไม่มี network)
 *  2. cache ผลตรวจ 30 วิ ต่อ user (key = sha256(user id) บน globalThis รอด HMR)
 *  3. ตรวจลายเซ็น JWT ในเครื่องด้วย JWKS (jose, ES256) — CPU ล้วน ไม่มี network
 *  4. request ขนานที่ยืนยัน token เดียวกัน → รวมเป็น call เดียว (single-flight)
 *  5. upstream ล้ม (429/5xx) → backoff 10 วิ + เสิร์ฟ cache เก่า (grace 5 นาที)
 *  6. เพดาน 20 network call/นาที ต่อ process — ประกันไม่มีทางยิง Supabase จนโดน
 *     rate limit อีก ไม่ว่าโค้ดอนาคตจะพลาดยังไง
 *
 * trade-off: revoke session กลางอากาศมีผลช้าสุด = อายุ access token (1 ชม.)
 * ยอมรับได้สำหรับ PMS — ไม่มีเงินเดินอัตโนมัติจากฝั่ง user
 * ========================================================================== */

type CacheEntry = {
  user: User;
  cachedAt: number;
};

const TTL_MS = 30_000;
const STALE_GRACE_MS = 5 * 60_000;
const NEGATIVE_TTL_MS = 10_000;
const MAX_ENTRIES = 1000;

// เก็บบน globalThis — HMR ตอน dev ไม่ล้าง cache (ไม่งั้นแก้โค้ดทีเจอ 429 ที)
const GLOBAL_KEY = Symbol.for("aoo.user-cache.v1");
type Holder = {
  cache: Map<string, CacheEntry>;
  inflight: Map<string, Promise<User | null>>;
  lastFailure: Map<string, number>;
};
const holder: Holder =
  (globalThis as unknown as Record<symbol, Holder>)[GLOBAL_KEY] ??
  ((globalThis as unknown as Record<symbol, Holder>)[GLOBAL_KEY] = {
    cache: new Map(),
    inflight: new Map(),
    lastFailure: new Map(),
  });
const { cache, inflight, lastFailure } = holder;

/** เปิด AOO_USER_CACHE_DEBUG=1 เพื่อดู HIT/MISS/LOCAL/DEDUPE ใน server log */
const DEBUG = process.env.AOO_USER_CACHE_DEBUG === "1";
function trace(kind: string, detail?: string) {
  if (!DEBUG) return;
  console.log(`[user-cache] ${kind}${detail ? " " + detail : ""}`);
}

/* ── อ่าน access token ตรงจาก cookie (@supabase/ssr แบ่ง chunk ได้) ────────── */

export function readAccessTokenFromCookieMap(
  getCookie: (name: string) => string | null,
  supabaseUrl: string,
): string | null {
  const ref = extractProjectRef(supabaseUrl);
  if (!ref) return null;
  const base = `sb-${ref}-auth-token`;

  let raw = getCookie(base);
  if (!raw) {
    let assembled = "";
    for (let i = 0; i < 10; i++) {
      const part = getCookie(`${base}.${i}`);
      if (!part) break;
      assembled += part;
    }
    if (assembled) raw = assembled;
  }
  if (!raw) return null;

  let json = raw;
  if (json.startsWith("base64-")) {
    try {
      json = atob(json.slice("base64-".length));
    } catch {
      return null;
    }
  }

  try {
    const parsed: unknown = JSON.parse(json);
    if (Array.isArray(parsed) && typeof parsed[0] === "string") {
      return parsed[0];
    }
    if (parsed && typeof parsed === "object") {
      const obj = parsed as { access_token?: unknown };
      if (typeof obj.access_token === "string") return obj.access_token;
    }
    return null;
  } catch {
    return null;
  }
}

function extractProjectRef(supabaseUrl: string): string | null {
  try {
    const host = new URL(supabaseUrl).hostname;
    return host.split(".")[0] || null;
  } catch {
    return null;
  }
}

async function sha256(input: string): Promise<string> {
  // Web Crypto — มีทั้ง Node 20+ และ Edge runtime (ห้าม node:crypto ใน middleware)
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const arr = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < arr.length; i++) hex += arr[i].toString(16).padStart(2, "0");
  return hex;
}

/** decode payload ของ JWT โดยไม่ตรวจลายเซ็น — ใช้กับงานที่ไม่ใช่ trust decision
 * เท่านั้น (กุญแจค้น cache / อ่าน aal เพื่อพาไปหน้า challenge) */
function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  const parts = jwt.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = parts[1]
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(parts[1].length + ((4 - (parts[1].length % 4)) % 4), "=");
    return JSON.parse(atob(payload)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** ดึง sub จาก JWT โดยไม่ตรวจลายเซ็น — ใช้เป็น "กุญแจค้น cache" เท่านั้น
 * ปลอดภัยเพราะค่าใน cache มาจากการตรวจจริง (local JWKS / getUser) เสมอ —
 * token ปลอมจะตรวจไม่ผ่านและไม่มีวันถูกเขียนลง cache · key ตาม user id
 * (ไม่ใช่ token) เพราะ @supabase/ssr หมุน token บ่อย hash token = miss ตลอด */
function extractUserIdFromJwt(jwt: string): string | null {
  const sub = decodeJwtPayload(jwt)?.sub;
  return typeof sub === "string" ? sub : null;
}

/** ระดับการยืนยันตัวตนของ session ปัจจุบัน (จุดเสียบ 2FA ในอนาคต):
 * `aal1` = ผ่าน factor เดียว (password/OAuth) · `aal2` = ผ่าน MFA แล้ว ·
 * null = ไม่มี session — ใช้ตัดสิน "พาไปหน้า MFA challenge" เท่านั้น
 * (อ่าน payload ไม่ตรวจลายเซ็น — การบังคับจริงอยู่ที่ guard/RLS ซึ่งใช้
 * token ที่ตรวจแล้วเสมอ · ฝั่ง DB บังคับเพิ่มได้ด้วย RLS `aal2` ตาม docs Supabase) */
export async function getSessionAal(): Promise<"aal1" | "aal2" | null> {
  const token = await readAccessTokenFromNextHeaders();
  if (!token) return null;
  const aal = decodeJwtPayload(token)?.aal;
  return aal === "aal1" || aal === "aal2" ? aal : null;
}

function pruneIfFull() {
  if (cache.size < MAX_ENTRIES) return;
  const dropCount = Math.ceil(MAX_ENTRIES * 0.1);
  let i = 0;
  for (const key of cache.keys()) {
    if (i >= dropCount) break;
    cache.delete(key);
    i++;
  }
}

/* ── ตรวจ JWT ในเครื่อง (JWKS — ไม่มี network ต่อ request) ─────────────────── */

let cachedJwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJwks(): ReturnType<typeof createRemoteJWKSet> | null {
  if (cachedJwks) return cachedJwks;
  let url: string;
  try {
    ({ url } = requireServerEnv());
  } catch {
    return null;
  }
  const jwksUrl = new URL("/auth/v1/.well-known/jwks.json", url);
  cachedJwks = createRemoteJWKSet(jwksUrl, {
    cooldownDuration: 30_000, // กันโดนบังคับ fetch JWKS รัวๆ ด้วย kid มั่ว
    timeoutDuration: 10_000,
  });
  return cachedJwks;
}

/** ตรวจลายเซ็นในเครื่อง — คืน User ขั้นต่ำจาก claims (field ที่แอปใช้จริง)
 * โปรเจกต์นี้ใช้ signing key แบบ asymmetric (ECC P-256) อยู่แล้ว — token ใหม่
 * เป็น ES256 ทุกใบ · ตรวจไม่ผ่าน (หมดอายุ/ลายเซ็นผิด) คืน null ให้ fallback
 * ไปตรวจผ่าน network (ซึ่งจะ refresh token ให้ด้วย — จุดต่ออายุรายชั่วโมง) */
async function verifyJwtLocally(token: string): Promise<User | null> {
  const jwks = getJwks();
  if (!jwks) return null;

  let payload: JWTPayload;
  try {
    const result = await jwtVerify(token, jwks, {
      algorithms: ["ES256"],
      audience: "authenticated",
    });
    payload = result.payload;
  } catch {
    return null;
  }
  if (!payload.sub) return null;

  const claims = payload as JWTPayload & {
    email?: string;
    phone?: string;
    role?: string;
    user_metadata?: Record<string, unknown>;
    app_metadata?: Record<string, unknown>;
  };
  return {
    id: claims.sub!,
    aud: typeof claims.aud === "string" ? claims.aud : "authenticated",
    email: claims.email,
    phone: claims.phone,
    role: claims.role,
    user_metadata: claims.user_metadata ?? {},
    app_metadata: claims.app_metadata ?? {},
    created_at: "",
  } as User;
}

/* ── เพดาน network call ต่อ process (ประกันชั้นสุดท้าย) ────────────────────── */

const RATE_CAP_PER_MIN = 20;
const RATE_CAP_WINDOW_MS = 60_000;
const upstreamCallTimes: number[] = [];

function recordAndCheckCap(): boolean {
  const now = Date.now();
  while (upstreamCallTimes.length && now - upstreamCallTimes[0]! > RATE_CAP_WINDOW_MS) {
    upstreamCallTimes.shift();
  }
  if (upstreamCallTimes.length >= RATE_CAP_PER_MIN) return false;
  upstreamCallTimes.push(now);
  return true;
}

/* ── core: cache → local verify → backoff → single-flight → network ────────── */

async function lookupOrVerify(
  token: string,
  verify: () => Promise<User | null>,
): Promise<User | null> {
  const userId = extractUserIdFromJwt(token);
  if (!userId) {
    trace("NO_TOKEN", "malformed JWT");
    return null;
  }
  const key = await sha256(userId);
  const keyShort = key.slice(0, 8);
  const now = Date.now();

  // 1. cache สด → จบเลย ไม่แตะ Supabase
  const entry = cache.get(key);
  if (entry && now - entry.cachedAt < TTL_MS) {
    trace("HIT", `key=${keyShort} age=${now - entry.cachedAt}ms`);
    return entry.user;
  }

  // 2. ตรวจลายเซ็นในเครื่อง (CPU ~1ms — ไม่ต้อง dedupe)
  const local = await verifyJwtLocally(token);
  if (local) {
    trace("LOCAL", `key=${keyShort}`);
    pruneIfFull();
    cache.set(key, { user: local, cachedAt: now });
    lastFailure.delete(key);
    return local;
  }

  // 3. เพิ่งล้มไปหยกๆ → backoff (เสิร์ฟของเก่าใน grace ได้)
  const failedAt = lastFailure.get(key);
  if (failedAt && now - failedAt < NEGATIVE_TTL_MS) {
    if (entry && now - entry.cachedAt < TTL_MS + STALE_GRACE_MS) {
      trace("NEGATIVE", `key=${keyShort} stale-served`);
      return entry.user;
    }
    trace("NEGATIVE", `key=${keyShort} null`);
    return null;
  }

  // 4. มีคนกำลังตรวจ token เดียวกันอยู่ → รอผลเดียวกัน (single-flight)
  const pending = inflight.get(key);
  if (pending) {
    trace("DEDUPE", `key=${keyShort}`);
    return pending;
  }

  // 5. เพดานต่อ process — เกินแล้วไม่ยิง เสิร์ฟของเก่า/null
  if (!recordAndCheckCap()) {
    trace("CAPPED", `key=${keyShort}`);
    if (entry && now - entry.cachedAt < TTL_MS + STALE_GRACE_MS) return entry.user;
    return null;
  }

  trace("MISS", `key=${keyShort} → Supabase`);

  const promise = (async () => {
    try {
      const user = await verify();
      if (!user) {
        // token มีแต่ใช้ไม่ได้ (revoked/หมดอายุ+refresh ไม่ได้) — ห้าม cache
        cache.delete(key);
        return null;
      }
      pruneIfFull();
      cache.set(key, { user, cachedAt: Date.now() });
      lastFailure.delete(key);
      return user;
    } catch (err) {
      lastFailure.set(key, Date.now());
      trace("ERROR", `key=${keyShort} ${(err as Error)?.message ?? err}`);
      const stale = cache.get(key);
      if (stale && Date.now() - stale.cachedAt < TTL_MS + STALE_GRACE_MS) {
        trace("STALE", `key=${keyShort} serving on upstream error`);
        return stale.user;
      }
      console.warn("[user-cache] verify failed, no stale cache", err);
      return null;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, promise);
  return promise;
}

/* ── ทางเรียกใช้ ─────────────────────────────────────────────────────────── */

/** Server Component / Server Action — อ่าน cookie เอง แตะ Supabase เฉพาะตอน miss */
export async function getCachedUser(supabase: SupabaseClient): Promise<User | null> {
  const token = await readAccessTokenFromNextHeaders();
  if (!token) {
    trace("NO_TOKEN");
    return null;
  }
  return lookupOrVerify(token, async () => {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error) throw error;
    return user ?? null;
  });
}

/** Middleware (proxy.ts) — client สร้างแบบ lazy: cache HIT ไม่แตะ Supabase เลย */
export async function getCachedUserFromRequest(
  getCookie: (name: string) => string | null,
  supabaseUrl: string,
  createSupabase: () => SupabaseClient,
): Promise<User | null> {
  const token = readAccessTokenFromCookieMap(getCookie, supabaseUrl);
  if (!token) {
    trace("NO_TOKEN");
    return null;
  }
  return lookupOrVerify(token, async () => {
    const supabase = createSupabase();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error) throw error;
    return user ?? null;
  });
}

/** อ่าน access token จาก cookie ของ request ปัจจุบัน (ไม่มี network — ใช้แยก
 * "logout จริง" (ไม่มี token) กับ "ตรวจไม่ผ่านชั่วขณะ" (มี token) ใน guard) */
export async function readAccessTokenFromNextHeaders(): Promise<string | null> {
  const { cookies } = await import("next/headers");
  const store = await cookies();
  let url: string;
  try {
    ({ url } = requireServerEnv());
  } catch {
    return null;
  }
  return readAccessTokenFromCookieMap((name) => store.get(name)?.value ?? null, url);
}
