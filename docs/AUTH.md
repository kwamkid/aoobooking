# สถาปัตยกรรม Authentication

> ของ AooBooking — **ฉบับกลางของตระกูล aoo (template + ไฟล์ต้นแบบพร้อม copy)
> แยกไปอยู่ที่ `/Users/ampstark/aoo-techstack/auth/`** · ไฟล์นี้คือรายละเอียด
> เฉพาะโปรเจกต์นี้ · เจอบทเรียนใหม่ให้อัปเดตฉบับกลางด้วยเสมอ
> อัปเดตล่าสุด 2026-07-24 — หลังเหตุการณ์ 429 rate limit (bugs.md §Auth)

## 1. ภาพรวม — แยก 4 ชั้น หน้าที่เดียวต่อชั้น

```
ผู้ใช้กด login                    ทุก request หลังจากนั้น
     │                                  │
     ▼                                  ▼
┌──────────────────┐   ┌────────────────────────────────────┐
│ ① Login methods  │   │ ③ Authen ต่อ request (user-cache)  │
│ lib/auth/        │   │ lib/supabase/user-cache.ts         │
│   sign-in.ts     │   │ cookie → cache → ตรวจในเครื่อง →   │
└────────┬─────────┘   │ single-flight → backoff → เพดานยิง │
         │             └────────┬───────────────────────────┘
         ▼                      │ ใช้โดย
┌──────────────────┐            ├── proxy.ts (middleware ทุก request)
│ ② Callback /     │            └── ④ Guards: lib/auth/index.ts
│    Sign-out      │                 requireUser / requireHotelMember /
│ app/auth/*/route │                 requireSuperAdmin → คืน SessionUser
└──────────────────┘                      │
    session → cookie                      ▼
                                   RLS ที่ DB (ชั้นบังคับจริงสุดท้าย)
```

| ชั้น | ไฟล์ | หน้าที่ (อย่างเดียว) |
|---|---|---|
| ① Login methods | [lib/auth/sign-in.ts](../src/lib/auth/sign-in.ts) | "เข้าสู่ระบบยังไง" — Google OAuth (อนาคต: LINE/อีเมล/OTP) |
| ② Callback / Sign-out | `app/auth/{callback,sign-out}/route.ts` | แลก code → session cookie (PKCE กลาง ใช้ได้ทุก OAuth provider) |
| ③ Authen ต่อ request | [lib/supabase/user-cache.ts](../src/lib/supabase/user-cache.ts) | "request นี้เป็นใคร" — โดยไม่ยิง Supabase |
| ④ Session guards | [lib/auth/index.ts](../src/lib/auth/index.ts) | "เข้าหน้านี้/ทำสิ่งนี้ได้ไหม" + redirect/throw ให้ถูกจังหวะ |

## 2. user-cache — หัวใจของชั้น ③

ทำงานเรียงชั้น (หยุดทันทีที่ชั้นไหนตอบได้):

1. อ่าน access token **ตรงจาก cookie** (ห้ามผ่าน `getSession()` — มันแอบ refresh)
2. **cache 30 วิ/user** บน `globalThis` (รอด HMR) — HIT = จบ ไม่แตะอะไร
3. **ตรวจลายเซ็น JWT ในเครื่อง** (jose + JWKS, ES256) — CPU ล้วน ไม่มี network
4. token หมดอายุ/ตรวจไม่ผ่าน → **single-flight**: request ขนานรวมเป็น network call เดียว (จุดนี้คือที่ refresh token รายชั่วโมงเกิดขึ้น)
5. upstream ล้ม (429/5xx) → **backoff 10 วิ + เสิร์ฟ cache เก่า** (grace 5 นาที) — Supabase สะดุด แอปไม่ล้มตาม
6. **เพดาน 20 network call/นาที/process** — ประกันขั้นสุดท้ายว่าไม่มีทางยิง Supabase จนโดน rate limit ไม่ว่าโค้ดอนาคตพลาดยังไง

Trade-off ที่ตัดสินใจแล้ว: revoke session กลางอากาศมีผลช้าสุด = อายุ access token (1 ชม.)
· debug: รัน dev ด้วย `AOO_USER_CACHE_DEBUG=1` เห็น HIT/LOCAL/MISS/DEDUPE ใน log

## 3. กฎเหล็ก

1. **ห้ามเรียก `supabase.auth.getUser()` / `getSession()` ตรงๆ ในโค้ด server** — getUser = network ทุกครั้ง (เคยพาโดน 429 ทั้งเว็บ) · getSession = แอบ refresh เผา token endpoint · อยากรู้ตัวตน → `requireUser()` · อยากรู้แค่ว่ามี token ไหม → `readAccessTokenFromNextHeaders()`
2. **ห้ามเรียก `auth.signIn*` จาก component** — logic การ login อยู่ `sign-in.ts` ที่เดียว
3. **middleware ห้าม redirect server action POST** (เช็ค header `next-action`) — พาผู้ใช้หลุดกลางงาน ให้ guard ระดับ action ตัดสินแทน
4. **guard แยก "logout จริง" กับ "สะดุดชั่วคราว" เสมอ** — มี token แต่ตรวจไม่ผ่าน = throw (toast "ลองใหม่") · ไม่มี token = redirect /login · query ที่ใช้ตัดสิน redirect ห้ามทิ้ง `error` (PGRST116 = 0 แถวจริง / อื่นๆ = สะดุด)
5. **redirect ที่รับ `?redirect=` มา ต้องส่งต่อ** — ห้ามเขียนกฎทับด้วยปลายทางตายตัว

## 4. Flow ต่อ 1 request (หลังบ้าน)

```
request → proxy.ts ──user-cache──▶ มี user?
   ├─ ไม่มี + path ต้อง auth + ไม่ใช่ server action → /login?redirect=เดิม
   ├─ มี + อยู่ /login → เด้งกลับตาม ?redirect= (ไม่มีค่อยไป /onboarding)
   └─ ผ่าน → page/action → requireHotelMember (cache ต่อ request:
        layout+page ใช้ผลร่วมกัน) → query จริง → RLS บังคับชั้นสุดท้าย
```

## 5. จุดขยาย: เพิ่มวิธี login

แก้ 2 ที่เท่านั้น ระบบหลังบ้านไม่ต้องรู้ว่า login มาทางไหน:

1. เพิ่มฟังก์ชันใน `lib/auth/sign-in.ts` — OAuth อื่น (LINE ฯลฯ) ใช้ `/auth/callback` เดิมได้เลย · อีเมล/รหัสผ่าน + OTP ไม่ต้องผ่าน callback
2. เพิ่มปุ่มในหน้า `/login`

## 6. จุดขยาย: 2FA (MFA)

ใช้ Supabase MFA (TOTP — แอป Authenticator) ของที่เตรียมไว้แล้ว:

- `getSessionAal()` (user-cache) — `aal1` = ผ่าน factor เดียว · `aal2` = ผ่าน MFA แล้ว
- หมุด 🔌 ใน `requireUser` — ประตูบังคับ 2FA เสียบ**ที่เดียว** มีผลทุกหน้า/ทุก action

ตอนทำจริงเหลือ: หน้า enroll (สแกน QR ผ่าน `auth.mfa.enroll`) + หน้า `/login/mfa`
(challenge/verify) + เปิดหมุดใน requireUser + (เข้มสุด) RLS `aal2` ฝั่ง DB

## 7. Template สำหรับโปรเจกต์อื่น

**เลือกสถาปัตยกรรมก่อน:**

| ชนิดแอป | ใช้แบบ | เหตุผล |
|---|---|---|
| มีหน้า public/SEO · หลาย tenant · เกี่ยวกับเงิน | **server-auth** (แบบไฟล์นี้) | เกราะอยู่หน้าประตู + SSR/SEO ได้ |
| เครื่องมือภายใน ทุกคน login หมด | **browser-auth** (แบบ aoocommerce) | ง่ายกว่ามาก ไม่มีปัญหา middleware/rate limit ให้แก้ |

**Checklist port แบบ server-auth ไปโปรเจกต์ใหม่:**

1. copy `lib/supabase/user-cache.ts` (แก้ import env ให้ตรง) — ต้องมี `jose`
2. proxy/middleware ใช้ `getCachedUserFromRequest` + client แบบ lazy + กติกา §3 ข้อ 3, 5
3. guard ใช้ `getCachedUser` ห่อ React `cache()` + กติกา §3 ข้อ 4
4. แยก `sign-in.ts` + `/auth/callback` PKCE กลาง
5. โปรเจกต์บน Supabase ต้องใช้ **signing key แบบ asymmetric** (ECC — โปรเจกต์ใหม่เป็น default) ไม่งั้น local verify ไม่ทำงานและจะ fallback network ทุกครั้ง
6. เทส: เปิดหลายแท็บทิ้งข้ามชั่วโมงแล้วกดปุ่ม — ต้องไม่หลุดหน้า · log ต้องไม่มี 429

**สถานะปัจจุบันของตระกูล aoo:** aoosocial ✅ (ต้นแบบ) · aoobooking ✅ (ไฟล์นี้) · aoocommerce = browser-auth ถูกแบบแล้ว ไม่ต้อง port

## 8. บทเรียนที่แลกมา (เต็มๆ อยู่ memo/bugs.md §Auth)

- `getUser()` ใน hot path → 429 ทั้งเว็บเหมือนโดน logout (2026-07-24)
- refresh token race → เด้ง /onboarding ทั้งที่ login อยู่ (2026-07-17 → ปิดจบ 2026-07-24)
- อาการ "เหมือน session หลุดแต่คลิกหน้าอื่นได้" = หน้าอื่นมาจาก router cache ฝั่ง client
