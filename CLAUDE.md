# AooBooking — Hotel Booking SaaS (multi-tenant PMS + Booking Engine + Channel Manager)

> ระบบจองโรงแรม + PMS หลังบ้าน แบบ multi-tenant SaaS — โรงแรมสมัครมาใช้ได้ รองรับหลายสาขา + Channel Manager ต่อ OTA (Agoda/Booking/Trip) ในอนาคต
> **สถานะ:** Phase 1 (PMS Core) ใช้งานจริงบน Supabase live — booking ครบวงจร (จอง/แก้/ยกเลิก/folio/checkout) · rates (ราคาปกติ+ช่วงพิเศษ) · เช่ารายเดือน (module เสริม) · super-admin + promotion/billing
> **Last Updated:** 2026-07-23

---

## 🚦 Start here

อ่านตามลำดับนี้:
1. **[devplan.md](memo/devplan.md)** — สถานะปัจจุบัน, อะไรเสร็จ, อะไรทำต่อ (อ่านก่อนเสมอ)
2. **[docs/PLAN.md](docs/PLAN.md)** — แผน implement ละเอียดทีละ step (STEP 0 → A → B → C → D/E/F) พร้อมเกณฑ์เสร็จ — **ทำงานตามไฟล์นี้**
3. **[docs/BLUEPRINT.md](docs/BLUEPRINT.md)** — เอกสารออกแบบเต็ม §1–21 (แหล่งความจริงของ requirement/schema/decisions)
4. **[docs/IMPLEMENTATION-NOTES.md](docs/IMPLEMENTATION-NOTES.md)** — คู่มือลงมือทำ + ข้อควรระวังรายระบบ (**อ่านก่อน implement ทุก feature**)
5. **CLAUDE.md** (ไฟล์นี้) — architecture, decisions, conventions
6. **[rules.md](memo/rules.md)** — กฎที่ต้องทำตามเสมอ
7. **[bugs.md](memo/bugs.md)** — กับดักที่เคยเจอ; **grep ก่อน debug** จะได้ไม่พลาดซ้ำ
8. **[learning.md](memo/learning.md)** — เทคนิค/สิ่งที่ค้นพบควรจำ
9. **โค้ดจริง** — แหล่งความจริงสูงสุดเมื่อเอกสารขัดกัน

หลังแก้อะไร: อัปเดต **devplan.md** (สถานะ), log bug+fix ลง **bugs.md**, เทคนิคใหม่ลง **learning.md** — ในการแก้รอบเดียวกัน

## 🧠 Log bugs to bugs.md, techniques to learning.md
- **ก่อน debug** → grep [bugs.md](memo/bugs.md) ก่อน — คำตอบอาจถูกจดไว้แล้ว
- **หลังแก้ bug จริง** (ไม่ใช่ typo/feature) → บอก user 1 บรรทัดว่ากับดักคืออะไร แล้วเสนอ log ลง bugs.md (symptom → root cause → fix → file/line) ใต้หัวข้อ subsystem ที่ถูก — ไม่เขียนเงียบๆ ให้ user รู้ตัว
- **เจอเทคนิค/pattern ใหม่ที่ควรเก็บ** → เสนอ log ลง learning.md แบบเดียวกัน
- Bug ที่ถูกจดครั้งเดียว = ไม่ต้อง debug ซ้ำอีก

---

## Tech Stack

| ส่วน | ใช้ | หมายเหตุ |
|------|-----|----------|
| Framework | **Next.js 16** (App Router) + React 19 | ยืม pattern จาก `aoosocial` |
| DB + Auth + Storage | **Supabase** (Postgres) | `@supabase/ssr` + `@supabase/supabase-js` |
| ORM | **ไม่มี** — raw Supabase client (PostgREST) + raw SQL migrations | types generate จาก live DB → `src/types/database.ts` |
| Styling | **Tailwind CSS v4** (ไม่มี shadcn) | hand-rolled components |
| Auth | **Supabase Auth + Google OAuth เท่านั้น** | key format ใหม่ (Publishable + Secret) + JWKS local verify |
| i18n | **next-intl** (cookie-based, ไทย+อังกฤษ) | ไม่มี locale ใน URL |
| Billing (SaaS) | **Beam/PromptPay** + ใบกำกับภาษีไทย | renewal manual + grace + cron downgrade |
| Package manager | **pnpm** | Node **>= 22** (engines — Node 20 ถูก Supabase deprecate) |
| Middleware | `src/proxy.ts` (Next 16 rename, ไม่ใช่ middleware.ts) | JWT cache |

**อ้างอิง pattern:** โปรเจกต์ `/Users/ampstark/aoosocial` (ยืม auth, RLS helpers, packages+overrides, superadmin, billing, client factories มาทั้งชุด)

## Architecture

**Multi-tenant (RLS-first) — tenant 2 ระดับ:**
```
profiles (1:1 auth.users, is_super_admin)
  └── hotels (TENANT — slug, package_id, base_currency)     ← package/billing ผูกที่นี่
        └── hotel_members (hotel_id + user_id → hotel_role)  ← M:N + role
        └── properties (สาขา — slug unique per hotel)
              └── room_types → rooms · room_type_inventory (จำนวน/blocked ต่อวัน)
              └── rate_plans → rate_base_prices (ราคาปกติ) + rate_prices (override ช่วงพิเศษ)
              └── bookings → booking_rooms / payments (ledger) / folio_items
              └── tenancies (เช่ารายเดือน — module เสริม, block ห้องผ่าน room_blocks)
```
- **Tenant isolation = Supabase RLS** (ไม่ใช่ app-layer filter) — ทุกตาราง tenant มี `hotel_id` + helper `user_role_in_hotel()` / `is_super_admin()` / `can_edit_hotel()` / `can_manage_hotel()` / `user_can(hotel_id, permission)` (SECURITY DEFINER กัน RLS recursion)
- **Policy triplet ทุกตาราง**: member-select / capability-write / super-admin-bypass (`or is_super_admin()`)
- **Routing**: path-based `/[hotel]/<page>` (เช่น `/baan-suan/dashboard`) ผ่าน helper `hotelHref()` เดียว (rules #19) · slug 2 ระดับ → `/baan-suan/phuket` (booking engine หน้าบ้าน)
- **Superadmin**: แยก route `/super-admin/*` + guard `requireSuperAdmin()` + global boolean `profiles.is_super_admin` (ตั้งผ่าน SQL เท่านั้น)

**โครง folder** (ดู BLUEPRINT §10):
```
src/app/(app)/[hotel]/  ← หลังบ้าน PMS (auth, path-based) — dashboard/bookings/front-desk/rooms/rates/guests/tenants/calendar/reports/settings
src/app/(booking)/[hotelSlug]/[[...property]]/  ← Booking Engine public
src/app/super-admin/    ← guard requireSuperAdmin()
src/app/auth/ login/ onboarding/ invite/[token]/
src/lib/supabase/ · auth/ · hotel/{href,revalidate,room-numbers}.ts · package/resolve-access.ts · payment/ · permission/ · next-error.ts
```

## Conventions (กฎเต็มอยู่ที่ [rules.md](memo/rules.md))

- **เงินเก็บเป็น satang (bigint) เสมอ** — ห้าม float; ทุก amount มี `currency` กำกับ + เก็บ `amount_base_satang` (แปลง base currency, freeze FX rate)
- **RLS-first** — ทุกตาราง tenant มี `hotel_id` + RLS policy; ห้าม filter แค่ app layer
- **สิทธิ์/เงินเช็ค 3 ชั้น** — DB (RLS `user_can()`) + app (`requirePermission()`) + UI (ซ่อน/disable ปุ่ม)
- **inventory mutation ผ่าน RPC + lock ใน transaction เท่านั้น** — ทุกอย่างที่แตะ `room_type_inventory` (create_booking / change_booking / create_tenancy ฯลฯ) กัน overbooking (กันเข้ม ห้ามจองเกิน)
- **revalidate cache ผ่าน `revalidateHotel()` เท่านั้น** — revalidatePath ตรงๆ เคยพังเงียบ 18 จุด (ลืม `/[hotel]` นำหน้า)
- **catch ใน server action ต้องเริ่มด้วย `isNextControlFlowError()` re-throw** — กันกลืน NEXT_REDIRECT (`src/lib/next-error.ts`)
- **module เสริมตามแพ็กเกจ**: `allow_*` บน packages + `*_override` บน hotel_package_overrides + `resolveAccess()` — gate 3 ชั้น (RPC / page / เมนู sidebar)
- **Permission**: fixed role preset + ติ๊กได้ (`role_permissions` override) · UI "ข้างในละเอียด ข้างนอกง่าย"
- **PDPA**: รูปบัตร/passport ใน private bucket (signed URL) + เก็บ consent timestamp
