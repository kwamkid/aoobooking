# AooBooking — Hotel Booking SaaS Blueprint

> ระบบจองโรงแรม + PMS หลังบ้าน แบบ multi-tenant SaaS รองรับหลายสาขา + Channel Manager ต่อ OTA
> Stack: **Next.js 16 (App Router) + Supabase (Postgres + Auth + Storage) + Tailwind v4 + RLS-first + raw SQL migrations**
> อ้างอิง pattern จากโปรเจกต์ `aoosocial` (ยืม multi-tenant / package / superadmin มาทั้งชุด)

เอกสารฉบับนี้เป็น **blueprint** — ยังไม่เขียนโค้ด ใช้เป็นแผนก่อนเริ่ม build

---

## 1. ชื่อระบบ: **AooBooking**

เลือก AooBooking เพราะครอบคลุมที่สุด — สื่อว่าเป็น "ระบบจอง" (หัวใจ) รองรับได้ทั้งหน้าบ้าน + หลังบ้าน + OTA และไม่ผูกกับคำว่า "hotel/room" ที่แคบเกินไปเมื่อลูกค้ามีรีสอร์ท/โฮสเทล/วิลล่า

- Domain (สมมติ): `aoobooking.com`
- Booking Engine หน้าบ้าน: `aoobooking.com/{hotel-slug}` และ `aoobooking.com/{hotel-slug}/{property-slug}`

---

## 2. ภาพรวม — ระบบต้องทำอะไรได้ (มองเป็น 3 กลุ่มคน)

### 👤 A. เจ้าของ/พนักงานโรงแรม (หลังบ้าน — PMS)
- จัดการ **สาขา (property)** หลายสาขาต่อ 1 โรงแรม/แบรนด์
- จัดการ **ประเภทห้อง + ห้อง** (Deluxe/Suite, จำนวนห้อง, สิ่งอำนวยความสะดวก, รูป)
- **ปฏิทินห้องว่าง (inventory calendar)** — เห็นภาพรวมว่าง/เต็ม/เข้า/ออก, drag ย้ายห้อง
- **จัดการราคา (rate plan)** — ราคาต่อวัน, high/low season, โปร, min-stay, ส่วนลดพักยาว
- **จัดการการจอง** — สร้าง/แก้/ยกเลิก, check-in / check-out, ย้ายห้อง
- **Front Desk** — วันนี้ใครเข้า/ออก, ห้องที่ต้องทำความสะอาด (housekeeping)
- **แขก (Guest)** — ประวัติลูกค้า, ลูกค้าเก่า/ประจำ
- **บิล/ชำระเงิน** — ใบเสร็จ, มัดจำ, ยอดค้าง, อัพสลิป (ต่อยอดจากระบบสลิปเดิม)
- **รายงาน** — รายได้, Occupancy, ADR, RevPAR, ยอดตามช่องทาง

### 🌐 B. ลูกค้าที่มาจอง (หน้าบ้าน — Booking Engine)
- เว็บจองตรงของแต่ละโรงแรม (ไม่เสียค่าคอมให้ OTA)
- ค้นห้องว่างตามวันที่/จำนวนคน → เลือกห้อง → กรอกข้อมูล → จ่าย (มัดจำ/เต็ม)
- อีเมลยืนยัน + จัดการ/ยกเลิกการจองเองได้

### ⚙️ C. คุณ (เจ้าของ SaaS — Superadmin กลาง)
- จัดการโรงแรมที่สมัครเข้ามา (แต่ละโรงแรม = 1 tenant แยกข้อมูลด้วย RLS)
- จัดการ **package / plan** + override รายเจ้า
- billing (Beam/PromptPay/ใบกำกับภาษี) + ดูภาพรวมทั้งระบบ

---

## 3. โครงสร้าง Tenant + Slug (ต่างจาก aoosocial)

aoosocial: 1 ระดับ (`company`) + ใช้ `public_id` opaque ไม่มี slug
**AooBooking: 2 ระดับ + slug ทั้งสองระดับ**

```
hotel (แบรนด์/เจ้าของ = tenant unit)   slug: baan-suan
  └── property (สาขา)                   slug: phuket, chiangmai
        └── room_type → room
```

| ระดับ | คือ | URL |
|-------|-----|-----|
| **hotel** | แบรนด์/นิติบุคคล = **tenant** (ผูก package, billing, members) | `/baan-suan` |
| **property** | สาขา (มี slug ของตัวเอง) | `/baan-suan/phuket` |

- **slug ระดับ hotel** — unique ทั้งระบบ (`hotels.slug`)
- **slug ระดับ property** — unique ภายใน hotel เดียวกัน (`properties.slug`, unique per `hotel_id`)
- ถ้า hotel มีสาขาเดียว → `/baan-suan` redirect ไปสาขา default ได้เลย
- **หลังบ้าน routing**: ยืม pattern aoosocial — active tenant เดินทางผ่าน query param `?h=<hotel-slug>` (แทน `?w=`) ผ่าน helper `hotelHref()` เดียว ปรับ URL shape ที่เดียวได้

> **สำคัญ (multi-tenant):** package/limit/billing ผูกที่ระดับ **hotel** ไม่ใช่ property — เพราะเราคิดเงินรวมทั้งแบรนด์ (จำนวนสาขา/ห้องรวมทุกสาขา)

---

## 4. Role Management (Fixed role + ติ๊กสิทธิ์ได้ — ต่างจาก aoosocial)

aoosocial = fixed enum ล้วน (hardcode, ตั้งเองไม่ได้)
**AooBooking = "role พร้อมใช้ + ปรับแต่งได้"** — มี role สำเร็จรูป แต่แต่ละ role เปิด/ปิดสิทธิ์รายอันได้ในหน้า permission matrix (รายละเอียดเต็ม §15)

**Role สำเร็จรูป (built-in preset):**

| Role | preset เริ่มต้น (ปรับได้) |
|------|-----------|
| **owner** | ทุกอย่าง + ลบ hotel + เปลี่ยน package + billing (มอบผ่าน invite ไม่ได้, สิทธิ์ล็อก) |
| **admin** | จัดการทีม, ตั้งค่าทุกสาขา, ต่อ OTA, ราคา |
| **manager** | จัดการสาขาที่รับผิดชอบ, ราคา, การจอง, รายงาน |
| **front_desk** | สร้าง/แก้การจอง, check-in/out, รับเงิน (ปกติปิด cancel/refund → ติ๊กเปิดได้) |
| **housekeeping** | หน้าแม่บ้านเท่านั้น (สถานะห้อง + ถ่ายรูปงาน — §18) |
| **viewer** | อ่านอย่างเดียว |

- **owner ล็อกสิทธิ์เต็ม** (แก้ไม่ได้ กัน lockout) · role อื่น**ติ๊กสิทธิ์รายอันได้** (§15)
- **(อนาคต) scope ระดับสาขา**: จำกัด manager/front_desk เห็นเฉพาะบางสาขา → เพิ่ม `member_property_access` ทีหลัง โดยไม่รื้อ role
- บังคับสิทธิ์ **2 ชั้น**: RLS ใน DB + helper ใน app — mirror กัน (§15.3)

---

## 5. Package / Plan (วางไว้ตั้งแต่แรก)

ยืมโครง `packages` + `company_package_overrides` + resolver `COALESCE(override, default)` จาก aoosocial

### 5.1 คิดเงินจากอะไร
**Limit-based (แบ่ง tier):** จำนวนสาขา · จำนวนห้องรวมทุกสาขา · จำนวน user seats · จำนวน OTA channels
**Feature-based (ดันอัปเกรด):** Booking Engine · Channel Manager · Dynamic pricing · รายงานขั้นสูง · Custom domain / ลบ branding

> **วิธีเก็บเงิน:** ตลาดไทย SME → **flat tier ราคาคงที่/เดือน** (เข้าใจง่าย ขายง่าย) โดยใช้ "จำนวนห้อง" เป็นตัวกำหนด tier — ได้ประโยชน์แบบ per-room โดยไม่ทำให้ลูกค้าสับสน
> รายได้เสริม: จองตรง **0% commission** (จุดขาย vs OTA) แต่เก็บ add-on: SMS ยืนยัน, OTA channel เพิ่ม, ค่า setup

### 5.2 ตาราง `packages` (limit = คอลัมน์บน plan row)

```sql
create table public.packages (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,          -- free / starter / pro / business / enterprise
  name text not null,
  description text,

  -- limits (null = unlimited)
  max_properties   int,               -- จำนวนสาขา
  max_rooms        int,               -- จำนวนห้องรวมทุกสาขา
  max_team_members int,               -- user seats
  max_ota_channels int,               -- จำนวน OTA ที่ต่อได้

  -- feature flags
  allow_booking_engine    boolean not null default false,
  allow_channel_manager   boolean not null default false,
  allow_dynamic_pricing   boolean not null default false,
  allow_advanced_reports  boolean not null default false,
  allow_custom_domain     boolean not null default false,
  remove_branding         boolean not null default false,

  price_thb_monthly int,
  price_thb_yearly  int,
  is_active boolean not null default true,
  is_public boolean not null default true,   -- false = enterprise ต้องเชิญ
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
```

### 5.3 Tier ที่แนะนำ

| Tier | ห้อง | สาขา | seats | OTA | Booking Engine | Channel Mgr | ราคา/ด. |
|------|-----|------|-------|-----|:---:|:---:|--------|
| **Free** | ≤5 | 1 | 2 | 0 | ❌ | ❌ | 0 |
| **Starter** | ≤15 | 1 | 5 | 0 | ✅ | ❌ | ~590 |
| **Pro** | ≤40 | 3 | 15 | 3 | ✅ | ✅ | ~1,590 |
| **Business** | ≤100 | 10 | ∞ | ∞ | ✅ | ✅ | ~3,900 |
| **Enterprise** | ∞ | ∞ | ∞ | ∞ | ✅ | ✅ | ติดต่อ |

### 5.4 Override รายเจ้า (superadmin escape hatch)
```sql
create table public.hotel_package_overrides (
  hotel_id uuid primary key references public.hotels(id) on delete cascade,
  max_properties_override int, max_rooms_override int, max_team_members_override int,
  max_ota_channels_override int,
  allow_channel_manager_override boolean, allow_dynamic_pricing_override boolean, -- ...ทุก flag
  reason text, granted_by uuid references public.profiles(id), expires_at timestamptz
);
```
**Resolver เดียว** อ่าน `COALESCE(override, package_default)` ใช้ทั้ง page guard + nav menu + cron (ห้ามแยกกัน) — ยืม pattern `resolve-*-access.ts` จาก aoosocial

---

## 6. Auth — Google Login เท่านั้น

ยืมจาก aoosocial ทั้งชุด:
- Supabase Auth + `signInWithOAuth({ provider: "google" })`
- signup trigger auto-สร้าง `profiles` row (มี `is_super_admin boolean`)
- PKCE callback `/auth/callback` (bind cookie กับ redirect response)
- Middleware = `src/proxy.ts` (Next 16 rename) + JWT cache + public path allowlist
- 3 client factories: server / middleware / browser + admin (service-role bypass RLS)
- ใช้ key format ใหม่ (Publishable + Secret) + JWKS verify local

---

## 7. Superadmin (หน้าจัดการ + ดูข้อมูลกลาง)

ยืม pattern aoosocial:
- แยก route tree `/super-admin/*` + `layout.tsx` + guard `requireSuperAdmin()`
- แยกด้วย global boolean `profiles.is_super_admin` (ตั้งผ่าน SQL เท่านั้น, RLS กันไม่ให้ self-escalate)
- ทุก RLS policy มี `or public.is_super_admin()` bypass → superadmin เห็น/แก้ทุก tenant

**หน้าที่ต้องมี:**
`dashboard` (ภาพรวม: จำนวนโรงแรม, ห้องรวม, การจอง, รายได้) · `hotels` (+ `[hotelId]` ดูรายละเอียด/ห้อง/การจองรายเจ้า) · `packages` (CRUD) · `overrides` · `billing` · `payments` · `channel-connections` (สถานะต่อ OTA รายเจ้า) · `coupons`

---

## 8. Channel Manager (OTA) — วาง abstraction ตั้งแต่วันแรก

**ความจริง:** Agoda / Booking.com / Trip.com ไม่เปิด API ต่อตรงง่ายๆ — ต้องสมัคร connectivity partner + ผ่าน certification (ใช้เวลา) ทางเริ่มที่นิยม = ต่อผ่าน Channel Manager เจ้าอื่น (SiteMinder / YieldPlanet) ก่อน แล้วค่อยทำ direct ทีหลัง

→ ออกแบบ **ชั้น abstraction ของ channel** ให้สลับ provider ได้โดยไม่รื้อ

งานหลัก sync 2 ทาง:

| Sync | ทิศทาง | คือ |
|------|--------|-----|
| **ARI** (Availability + Rate + Inventory) | เรา → OTA | อัปเดตห้องว่าง/ราคา/เงื่อนไข ไปทุก OTA พร้อมกัน |
| **Reservation** | OTA → เรา | จองผ่าน OTA → เด้งเข้าระบบเราอัตโนมัติ (webhook/pull) |
| **กันห้องชน (overbooking)** | 2 ทาง | จอง 1 ห้อง (ตรงหรือ OTA) → ตัดห้องออกจากทุกช่องทางทันที |

ตาราง (Phase 3):
```sql
create table public.channels (         -- OTA ที่ hotel/property ต่อ
  id uuid primary key, property_id uuid references properties(id),
  provider text,                        -- agoda | booking_com | trip_com | siteminder ...
  external_property_id text, credentials jsonb,
  status text, last_synced_at timestamptz
);
create table public.channel_room_map (  -- map ห้องเรา ↔ ห้อง OTA
  channel_id uuid, room_type_id uuid, external_room_id text, external_rate_id text
);
create table public.sync_logs (...);     -- audit การ sync
```

---

## 9. Database Schema — โครงหลัก (ER)

```
profiles (1:1 auth.users, is_super_admin)
   │
   │ owner_id / members
   ▼
hotels (TENANT)  ── slug, package_id, is_active, deleted_at
   │  └── hotel_members (hotel_id + user_id → hotel_role)      [M:N + role]
   │  └── hotel_package_overrides
   │  └── subscriptions / invoices / saved_cards               [billing]
   ▼
properties (สาขา) ── slug (unique per hotel), address, timezone, check_in/out time
   │
   ├── room_types ── name, base_occupancy, max_occupancy, amenities, photos
   │      └── rooms ── room_number, floor, status(clean/dirty/oos)
   │      └── room_blocks ── ปิดห้องซ่อมเป็นช่วงวันที่ (§21.4)
   │      └── room_type_inventory (room_type_id, date) ── total/booked/blocked   ← ห้องว่างต่อวัน
   │      └── rate_plans ── name, deposit_policy, cancellation_policy  ← ตั้งมัดจำ+ยกเลิกต่อ plan
   │             └── rate_prices (rate_plan_id, room_type_id, date)    ← ราคา+min_stay ต่อวัน (§21.6)
   │
   ├── bookings ── code, guest_id, channel(direct/agoda/...), status, check_in, check_out,
   │      │         total_amount, deposit_amount, paid_amount, balance_due          ← ยอดครบ
   │      └── booking_rooms (booking_id, room_type_id, room_id, rate, dates)
   │      └── payments (booking_id, direction(charge/refund), amount, method,        ← ต่อยอดระบบสลิป
   │                    slip_url, gateway_ref, status)                               ← 1 booking หลาย payment
   │
   ├── guests ── name, phone, email, id_card, history
   │
   └── channels / channel_room_map / sync_logs                 [Phase 3 OTA]
```

**ทุกตาราง tenant-scoped มี `hotel_id`** (property-level ตารางก็มี `hotel_id` ด้วยเพื่อ RLS + report ข้ามสาขา) — ยืม RLS pattern:
```sql
-- helper (SECURITY DEFINER กัน RLS recursion) — ยืมจาก aoosocial
user_role_in_hotel(hotel_id) · is_super_admin() · can_edit_hotel(id) · can_manage_hotel(id)

-- ทุกตารางใช้ triplet เดิม: member-select / capability-write / super-admin-bypass
create policy rooms_select on rooms for select to authenticated
  using (user_role_in_hotel(hotel_id) is not null or is_super_admin());
```

---

## 10. โครงสร้าง Folder (App Router — ยืม aoosocial)

```
src/
├── proxy.ts                      ← middleware (Next 16) — session + tenant redirect
├── app/
│   ├── (app)/                    ← หลังบ้าน PMS (authenticated, ?h=<hotel-slug>)
│   │   ├── dashboard/ calendar/ bookings/(new,[id]) front-desk/ housekeeping/
│   │   ├── rooms/ rates/ guests/ reports/
│   │   └── settings/(general, team, properties, channels, billing, package)
│   ├── (booking)/[hotelSlug]/[[...property]]/   ← Booking Engine หน้าบ้าน (public)
│   ├── super-admin/              ← guard requireSuperAdmin()
│   │   └── dashboard/ hotels/ packages/ overrides/ billing/ payments/ channel-connections/
│   ├── auth/(callback, sign-out)/  login/  onboarding/(create-hotel)/  invite/[token]/  no-access/
│   └── api/  (webhooks/(beam, ota), cron/(sync-ari, downgrade, ...), booking/, avatar/)
├── lib/
│   ├── supabase/(server, middleware, client, admin).ts
│   ├── auth/index.ts             ← requireHotelMember, requireSuperAdmin, canManage/canEdit
│   ├── hotel/href.ts             ← hotelHref() (URL shape ที่เดียว)
│   └── package/resolve-access.ts ← COALESCE(override, default) resolver
└── types/database.ts             ← generated จาก supabase gen types
```

---

## 11. Roadmap (แบ่งเฟส)

- **Phase 0 — Foundation**: scaffold Next.js 16 + Supabase, auth (Google), tenant trio (profiles/hotels/hotel_members), RLS helpers, slug ทั้ง 2 ระดับ, onboarding (สร้าง hotel), invite link, superadmin shell, packages + resolver, **permission system (§15)**
- **Phase 1 — PMS Core (MVP)**: properties, room_types/rooms, rate_calendar, bookings + CRUD เต็ม (change date/room move/cancel §14), front desk (check-in/out), guests, **payments ledger + folio (§14,§17)** + อัพสลิป, ปฏิทิน inventory, รายงานพื้นฐาน
- **Phase 2 — Ops**: **Night Audit + รายงานสิ้นวัน (§16)**, **housekeeping + หน้าแม่บ้านถ่ายรูป (§18)**, mid-stay room move (§14.9), รายงานรายได้แยกช่องทาง
- **Phase 3 — Booking Engine**: หน้าบ้าน `/[hotelSlug]`, ค้นห้องว่าง, จองตรง, จ่ายออนไลน์ (Beam/PromptPay), อีเมลยืนยัน, จัดการ/ยกเลิกการจองเอง
- **Phase 4 — Channel Manager**: channel abstraction, ต่อ OTA (เริ่มผ่าน partner), ARI sync, reservation import, กัน overbooking
- **Phase 5 — Advanced**: dynamic pricing, รายงานขั้นสูง (ADR/RevPAR/pace), custom domain, เชื่อม POS ร้านอาหาร→folio, mobile app

---

## 14. Booking Lifecycle & Payments (การจอง / แก้ / ยกเลิก / ชำระ / คืนเงิน)

หัวใจของ PMS — ครอบคลุมทุก action ที่พนักงาน front desk ต้องทำจริง

### 14.1 สถานะการจอง (booking status)

```sql
create type booking_status as enum (
  'pending',      -- สร้างแล้วรอชำระ/รอยืนยัน (ยังไม่การันตีห้อง)
  'confirmed',    -- ยืนยันแล้ว (จ่ายมัดจำ/เต็ม หรือ pay-at-hotel ที่ยืนยัน)
  'checked_in',   -- แขกเข้าพักแล้ว
  'checked_out',  -- ออกแล้ว (จบสมบูรณ์)
  'cancelled',    -- ยกเลิก
  'no_show'       -- ไม่มาตามนัด
);
```

### 14.2 CRUD + การแก้ไขการจอง (ครบทุก action)

| Action | ทำอะไร | ผลกระทบ |
|--------|--------|----------|
| **สร้าง** (walk-in / โทรจอง / หน้าบ้าน / OTA) | เลือกสาขา→room type→วันที่→แขก | ตัด inventory (`rate_calendar`), คำนวณ total + มัดจำ |
| **แก้ข้อมูลแขก** | ชื่อ/เบอร์/บัตร/note | — |
| **เปลี่ยนวันเข้าพัก (change date)** | ย้าย check-in/out | เช็คห้องว่างวันใหม่ → คืน inventory วันเดิม + ตัดวันใหม่ → คำนวณราคาใหม่ (อาจมีส่วนต่าง = charge/refund เพิ่ม) |
| **เปลี่ยน/ย้ายห้อง (room move)** | เปลี่ยน room type หรือ room number | คำนวณราคาใหม่ตาม rate ห้องใหม่ |
| **เพิ่ม/ลดจำนวนห้อง** | หลายห้องใน 1 booking (`booking_rooms`) | ปรับ total |
| **ยกเลิก (cancel)** | ตั้ง status=cancelled | คืน inventory ทุกวัน + คำนวณค่าปรับ/ยอดคืนตาม policy (§14.4) |
| **No-show** | ตั้ง status=no_show | ตาม policy (ปกติยึดมัดจำ) |
| **Check-in / Check-out** | assign ห้องจริง + อัปเดตสถานะ | trigger housekeeping (ห้อง→dirty ตอน check-out) |

> ทุก action ที่กระทบ inventory ต้องทำใน **transaction เดียว** (กันห้องชน) — และเมื่อต่อ OTA แล้ว ต้อง trigger ARI sync ไปทุก channel

### 14.3 มัดจำ (deposit) — ยืดหยุ่นต่อ rate plan

เก็บ policy เป็น JSON บน `rate_plans` (ตั้งได้ต่อ rate plan/สาขา):

```sql
-- rate_plans.deposit_policy jsonb เช่น:
-- { "type": "none" }                          -- ไม่เก็บมัดจำ (จ่ายที่โรงแรม)
-- { "type": "percent", "value": 20 }          -- มัดจำ 20% ของยอด
-- { "type": "fixed", "value": 1000 }          -- มัดจำ 1,000 บาท
-- { "type": "first_night" }                   -- มัดจำ = ราคาคืนแรก
-- { "type": "full" }                          -- จ่ายเต็มตอนจอง
```
ตอนสร้าง booking → resolver คำนวณ `deposit_amount` จาก policy → `balance_due = total - paid`

### 14.4 นโยบายยกเลิก + คำนวณยอดคืนอัตโนมัติ

เก็บเป็น JSON บน `rate_plans.cancellation_policy` — ระบบคำนวณยอดคืนเองจากจำนวนวันก่อน check-in:

```sql
-- cancellation_policy jsonb เช่น:
-- { "type": "non_refundable" }                       -- ไม่คืนเลย
-- { "type": "free_until", "days_before": 3 }          -- ฟรีถ้ายกเลิกก่อน 3 วัน หลังจากนั้นยึดมัดจำ
-- { "type": "tiered", "rules": [                      -- แบบขั้นบันได
--     { "days_before": 7, "refund_percent": 100 },
--     { "days_before": 3, "refund_percent": 50 },
--     { "days_before": 0, "refund_percent": 0 } ] }
```
ตอนกดยกเลิก → ระบบเทียบ "วันนี้ vs check-in" กับ policy → แสดง **ยอดที่ต้องคืน** ให้พนักงานเห็นก่อนยืนยัน → สร้าง refund record

### 14.5 ช่องทางชำระเงิน (payment methods)

```sql
create type payment_method as enum (
  'cash',            -- เงินสด (พนักงานรับ)
  'bank_transfer',   -- โอน + อัพสลิป (ต่อยอดระบบสลิปเดิม → slip_url)
  'card_terminal',   -- รูดบัตรที่เครื่อง EDC หน้าโรงแรม (บันทึกอย่างเดียว)
  'promptpay_qr',    -- PromptPay QR ออนไลน์ (Beam) — ยืนยันอัตโนมัติผ่าน webhook
  'card_online',     -- บัตรออนไลน์ (Beam)
  'wechat_pay',      -- WeChat Pay
  'alipay',          -- Alipay
  'ota_collect',     -- OTA เก็บเงินแทน (Agoda/Booking collect) — เราแค่ record
  'other'
);
```
- **โอน+อัพสลิป**: แขก/พนักงานอัปโหลดสลิป → `slip_url` → พนักงานกดยืนยัน (verify) — ต่อยอดระบบอัพสลิปเดิมของคุณได้เลย
- **PromptPay QR / card online / WeChat / Alipay**: ผ่าน Beam gateway → `gateway_ref` → webhook ยืนยันอัตโนมัติ
- **cash / card_terminal**: บันทึกอย่างเดียว (จ่ายจริงนอกระบบ)

### 14.6 ชำระบางส่วน (partial payment) + ตาราง payments

**1 booking มีได้หลาย payment** (มัดจำ → จ่ายเพิ่ม → จ่ายส่วนที่เหลือ) — โครง ledger:

```sql
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references hotels(id),      -- สำหรับ RLS + report
  booking_id uuid not null references bookings(id) on delete cascade,
  direction text not null default 'charge',          -- 'charge' | 'refund'
  amount_satang bigint not null,                     -- เก็บเป็นสตางค์กัน float error
  method payment_method not null,
  status text not null default 'pending',            -- pending | confirmed | failed | voided
  slip_url text,                                     -- โอน+สลิป
  gateway_ref text,                                  -- Beam charge id
  reference_payment_id uuid references payments(id), -- refund ชี้กลับ payment ที่คืน
  note text,
  received_by uuid references profiles(id),          -- พนักงานที่รับ (cash)
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);
```
`paid_amount = sum(charge.confirmed) - sum(refund.confirmed)` · `balance_due = total - paid_amount`
→ แสดงบน booking: **จ่ายแล้ว / ค้างชำระ / เกิน** แบบเรียลไทม์

### 14.7 คืนเงิน (refund) — บันทึกในระบบ + คืนจริงนอกระบบ

- กดยกเลิก/แก้วัน → ระบบคำนวณยอดคืน (§14.4) → สร้าง `payments` row `direction='refund'`
- **คืนจริงทำนอกระบบ** (โอนคืน/เงินสด) → พนักงานกดยืนยัน `status=confirmed` + แนบหลักฐาน (`slip_url`/note)
- ระบบ track ครบ: คืนเท่าไหร่, วิธีไหน, ใครทำ, เมื่อไหร่ → ออกรายงาน refund ได้
- (อนาคต) ถ้าจ่ายผ่าน Beam → เพิ่มปุ่ม refund ยิง gateway API อัตโนมัติได้ทีหลัง โดยไม่รื้อ schema

### 14.8 ใบเสร็จ / ใบกำกับภาษี
- ออกใบเสร็จจากยอด confirmed · ใบกำกับภาษีเต็มรูป (VAT 7%) → ยืมระบบ `tax_invoice_counters` + running number จาก aoosocial

### 14.9 ย้ายห้องระหว่างพัก (mid-stay room move)
- แขกพักไปแล้ว N คืน ต้องการย้ายห้อง (เช่น แอร์เสีย / อัปเกรด) → ระบบต้อง **split ต่อคืน**:
  - คืน 1–2 = ห้องเดิม (ราคาเดิม), คืน 3+ = ห้องใหม่ (ราคาใหม่) → `booking_rooms` แตกเป็นหลาย segment ตามช่วงวัน
  - คืน inventory ห้องเดิมเฉพาะคืนที่ย้ายออก + ตัด inventory ห้องใหม่เฉพาะคืนที่เข้า
  - บันทึกเหตุผลย้าย (maintenance/upgrade/complaint) ลง log
- ต่างจาก "เปลี่ยนห้องทั้ง booking" (§14.2) ที่เปลี่ยนทุกคืน — อันนี้เปลี่ยนบางคืน

---

## 15. Permission System (Configurable CRUD — ราย module + action)

**โมเดล: Fixed role preset + ติ๊กสิทธิ์รายอันได้** (ยกระดับจาก aoosocial fixed-enum)

### 15.1 permission keys (ราย module.action)
```
bookings.view / bookings.create / bookings.edit / bookings.change_date /
  bookings.move_room / bookings.cancel / bookings.checkin / bookings.checkout
payments.view / payments.charge / payments.refund / payments.verify_slip
folio.view / folio.add_charge / folio.void_charge
rooms.view / rooms.edit          rates.view / rates.edit
guests.view / guests.edit
housekeeping.view / housekeeping.update / housekeeping.assign
reports.view / reports.night_audit
channels.view / channels.manage  (OTA)
settings.team / settings.billing / settings.properties / settings.package
```
> จุดขาย: **`bookings.cancel` และ `payments.refund` แยกออกจากกัน** → front_desk สร้าง/แก้จองได้ แต่ยกเลิก/คืนเงินต้องเปิดสิทธิ์เพิ่ม (กันพนักงานคืนเงินมั่ว)

### 15.2 Schema (fixed role + override matrix)
```sql
-- role ยังเป็น enum (built-in preset) — เก็บบน hotel_members.role เหมือนเดิม
-- preset สิทธิ์ default ของแต่ละ role = เก็บใน code (seed) หรือตาราง role_permission_presets

create table public.role_permissions (      -- override รายโรงแรม (ติ๊กในหน้า matrix)
  hotel_id   uuid not null references hotels(id) on delete cascade,
  role       hotel_role not null,
  permission text not null,                  -- 'bookings.cancel' ...
  allowed    boolean not null,               -- true=เปิด / false=ปิด (override preset)
  primary key (hotel_id, role, permission)
);
-- ไม่มี row = ใช้ค่า preset default ของ role นั้น
-- resolver: effective = COALESCE(role_permissions.allowed, preset_default(role, permission))
```
> owner ไม่เข้า matrix นี้ (สิทธิ์เต็มล็อกไว้เสมอ กัน lockout)

### 15.3 บังคับ 3 ชั้น
1. **DB (RLS)** — helper `user_can(hotel_id, 'bookings.cancel')` (SECURITY DEFINER) อ่าน role → resolve permission → คืน boolean; policy เขียนตรงๆ `user_can(hotel_id,'bookings.cancel')` แทนการเทียบ enum
2. **App (server action)** — `requirePermission('bookings.cancel')` ก่อนทำงานจริง
3. **UI** — ซ่อน/disable ปุ่มตามสิทธิ์ (`can('payments.refund')`)

### 15.4 หน้า UI — "ข้างในละเอียด ข้างนอกง่าย"

**หลักการ:** schema + permission keys ละเอียดครบ (ราย `module.action`) แต่ **หน้าที่ user เห็นต้องง่าย ไม่ยัด matrix 30 ช่อง** เดี๋ยว user งง → แบ่ง **2 ชั้น**

**ชั้น 1 — Simple (default ที่ user เห็นก่อน)**
- แสดงเป็น **การ์ด role** พร้อมคำอธิบายภาษาคน (เช่น "พนักงานหน้าเคาน์เตอร์ — จอง/เช็คอิน/รับเงิน")
- มี **toggle กลุ่มใหญ่ไม่กี่อัน** ต่อ role — จัดกลุ่ม permission keys เป็น "capability" ที่เข้าใจง่าย:

| Toggle (กลุ่ม) | รวม permission keys ข้างใน |
|----------------|---------------------------|
| ✅ จัดการการจอง | bookings.create/edit/change_date/move_room/checkin/checkout |
| ⬜ ยกเลิก & คืนเงิน | bookings.cancel + payments.refund |
| ✅ รับชำระเงิน | payments.charge + payments.verify_slip + folio.add_charge |
| ⬜ ตั้งราคา & ห้อง | rooms.edit + rates.edit |
| ⬜ ดูรายงาน | reports.view + reports.night_audit |
| ⬜ ตั้งค่า & ทีม | settings.* |

→ user แค่เปิด/ปิดกลุ่ม ไม่ต้องรู้ว่าข้างในมี key อะไรบ้าง (ปุ่มเดียวคุมหลาย key)

**ชั้น 2 — Advanced (ซ่อนไว้ใต้ปุ่ม "ตั้งค่าขั้นสูง")**
- คนที่อยากลึกค่อยกดเปิด → เห็น matrix เต็ม row=permission × column=role (ยืมโครง `role-help.tsx` แปลงเป็น checkbox)
- ติ๊ก/ปลด → server action เขียน `role_permissions` → clear cache

**ล็อกเสมอ:** owner = สิทธิ์เต็ม กดไม่ได้ (กัน lockout)

> สรุป: **preset ดีพอให้ 90% ไม่ต้องแตะ** · toggle กลุ่มพอสำหรับปรับทั่วไป · matrix เต็มเก็บไว้ให้ 10% ที่ต้องการจริง

### 15.5 หน้า Invite (ยืม aoosocial ตรงๆ)
- **Link invite ใช้ครั้งเดียว, สร้างได้เรื่อยๆ** — token `randomBytes(32).toString('base64url')`, `accept_invite()` แบบ atomic `FOR UPDATE` lock + `used_count < max_uses`
- เลือก role ตอนสร้าง link · owner เชิญผ่าน link ไม่ได้ (DB check constraint)

---

## 16. Night Audit / Business Day (โรงแรม 24 ชม.)

**ปัญหา:** โรงแรมทำงาน 24 ชม. "วันทำการ" ไม่ตรงกับเที่ยงคืน → ต้องมี cutoff กำหนดเองว่า "สิ้นวัน" กี่โมง

### 16.1 ตั้งค่า cutoff ต่อสาขา
```sql
-- properties.business_day_cutoff time default '06:00'   -- แต่ละสาขาตั้งเองได้
-- properties.night_audit_mode text default 'auto'       -- 'auto' | 'manual' | 'both'
```
- **auto**: cron รันตอน cutoff (เช่น 06:00) → snapshot ยอด, ปิดวัน, roll วันใหม่
- **manual**: พนักงานกะดึกกดปุ่ม "ปิดยอดสิ้นวัน" เอง (เหมือนปิด POS)
- **both** (ที่เลือก): auto ตั้งเวลาไว้ + พนักงานกดปิดเองก่อนได้

### 16.2 รายงานสรุปเปิด-ปิดยอด (Night Audit report)
สร้าง snapshot ต่อ business day ต่อสาขา:
```sql
create table public.business_day_reports (
  id uuid primary key, property_id uuid, business_date date,
  opened_at timestamptz, closed_at timestamptz, closed_by uuid,
  -- ยอดสรุป (snapshot ณ ตอนปิด)
  arrivals int, departures int, stay_overs int, occupancy_percent numeric,
  rooms_sold int, adr numeric, revpar numeric,
  revenue_room bigint, revenue_extra bigint, revenue_total bigint,   -- แยกห้อง/ค่าอื่น
  payment_cash bigint, payment_transfer bigint, payment_card bigint,  -- แยกช่องทาง
  payment_qr bigint, refunds_total bigint,
  no_shows int, cancellations int,
  created_at timestamptz default now(),
  unique (property_id, business_date)
);
```
→ พนักงานเปิดกะเห็น "ยอดเมื่อวาน", ผู้จัดการดูย้อนหลังได้, ปิดแล้วล็อก (แก้ย้อนต้องมีสิทธิ์)

---

## 17. Folio / Guest Ledger (ค่าอาหาร ค่าอื่นๆ + จ่ายก่อน/หลัง)

**Folio = บิลรวมของแขก 1 ใบต่อ booking** — รวมทุกค่าใช้จ่าย + ทุกการชำระ แล้วจ่ายเมื่อไหร่ก็ได้

รองรับทั้ง 2 แบบที่คุณถาม:
- **จ่ายก่อนเข้าพัก + จ่ายเพิ่มตอนสั่งของ** → charge เข้า folio ระหว่างพัก, payment เข้ามาเรื่อยๆ
- **จ่ายทีหลัง (city ledger / จ่ายตอน check-out)** → charge สะสม, balance_due ค้างไว้, เคลียร์ตอนออก

### 17.1 Schema
```sql
create table public.folios (
  id uuid primary key, hotel_id uuid, booking_id uuid unique,
  status text default 'open',              -- open | settled | closed
  total_charges bigint, total_payments bigint, balance bigint
);
create table public.folio_items (          -- line item ค่าใช้จ่าย
  id uuid primary key, folio_id uuid, hotel_id uuid,
  category text,                           -- room | food | minibar | laundry | spa | transport | other
  description text, quantity int default 1,
  unit_price_satang bigint, amount_satang bigint,
  posted_by uuid, posted_at timestamptz default now(),
  voided boolean default false, void_reason text
);
-- payments (§14.6) ผูก booking_id → เป็นฝั่ง "จ่าย" ของ folio เดียวกัน
```
`balance = total_charges - total_payments` (ค่าห้อง auto-post จาก booking + ค่าอื่น post มือ/จาก POS)

### 17.2 (อนาคต) เชื่อม POS ร้านอาหาร/มินิบาร์
- Phase หลัง: ต่อ POS → charge เด้งเข้า folio อัตโนมัติ (`folio_items.category='food'`)
- ตอนนี้วาง schema เผื่อไว้ (post มือได้ก่อน)

---

## 18. Housekeeping (สถานะห้อง + หน้าแม่บ้านถ่ายรูปยืนยัน)

แนวทางมาตรฐานที่โรงแรมจริงจังใช้ (Cloudbeds/Flexkeeping) = **proof-of-service photo verification**

### 18.1 สถานะห้อง + มอบงาน
```sql
-- rooms.housekeeping_status: clean | dirty | inspected | out_of_order
create table public.housekeeping_tasks (
  id uuid primary key, hotel_id uuid, property_id uuid, room_id uuid,
  task_date date, type text,               -- checkout_clean | stayover_clean | inspection
  assigned_to uuid references profiles(id),  -- มอบงานแม่บ้านคนไหน
  status text default 'pending',           -- pending | in_progress | done | inspected
  started_at timestamptz, completed_at timestamptz,   -- รู้ว่าเสร็จกี่โมง
  note text
);
create table public.housekeeping_photos (
  id uuid primary key, task_id uuid, room_id uuid,
  photo_url text not null,
  captured_at timestamptz not null,        -- เวลาถ่ายจริง (จาก client)
  gps_lat numeric, gps_lng numeric,        -- พิกัดตอนถ่าย
  uploaded_by uuid, is_camera_capture boolean default true   -- บังคับถ่ายสด
);
```

### 18.2 หน้าแม่บ้าน (mobile-first แยกจาก PMS)
- หน้าเฉพาะ role housekeeping → เห็นเฉพาะ **งานที่ถูกมอบหมายวันนี้** (ห้องไหนต้องทำ)
- กด "เริ่มงาน" → ทำ → **"ถ่ายรูปยืนยัน"** = เปิดกล้องโดยตรง (camera capture) **ห้ามเลือกจาก gallery**
  - เก็บ `captured_at` + GPS ตอนถ่าย → กันถ่ายทิ้งไว้ล่วงหน้า/ถ่ายจากที่อื่น
  - อัปขึ้น storage ทันที ผูก room + housekeeper + เวลา
- กด "เสร็จ" → `completed_at` = รู้ว่าห้องนี้เสร็จกี่โมง, ใครทำ, มีรูปหลักฐาน
- (option) หัวหน้าแม่บ้านกด "inspected" ตรวจซ้ำ
- **ทำไมต้องถ่ายสด:** กันแม่บ้านเคลมว่าทำแล้วทั้งที่ยังไม่ทำ → มี audit ครบ เวลา+รูป+พิกัด

---

## 19. Multi-Currency (รองรับหลายสกุลเงินเต็มตั้งแต่แรก)

**เป้าหมาย:** โรงแรมขายห้อง/รับเงินได้หลายสกุล (นักท่องเที่ยวต่างชาติ) แต่รายงาน/บัญชียังกระทบยอดถูก

### 19.1 หลักการออกแบบ (กันปวดหัวภายหลัง)
1. **แยก 2 สกุลเสมอ**: `presentment` (สกุลที่แขกเห็น/จ่าย) vs `base` (สกุลบัญชีของโรงแรม)
2. **ทุกจำนวนเงินเก็บคู่กับ currency + amount ในหน่วยย่อย (satang/cent)** — ห้ามเก็บ float
3. **freeze FX rate ณ เวลาทำรายการ** — เก็บ rate ที่ใช้ลง row นั้นเลย (ไม่ query ใหม่) → รายงานย้อนหลังไม่เพี้ยน
4. **รายงานรวมใช้ base currency** เสมอ (แปลงด้วย rate ที่ freeze ไว้)

### 19.2 ตั้งค่าสกุลเงิน
```sql
-- hotels.base_currency        char(3) default 'THB'   -- สกุลบัญชีของแบรนด์ (ยอดในรายงาน)
-- properties.default_currency char(3)                 -- สกุลตั้งต้นที่สาขาแสดงราคา (null=ใช้ base)
-- hotels.accepted_currencies  char(3)[]               -- สกุลที่รับได้ (booking engine ให้เลือก)

create table public.fx_rates (            -- อัตราแลกเปลี่ยน (อัปเดตรายวัน/มือ)
  hotel_id uuid, base_currency char(3), quote_currency char(3),
  rate numeric not null, as_of date not null,
  source text,                            -- manual | api
  primary key (hotel_id, quote_currency, as_of)
);
```

### 19.3 ทุกตารางที่แตะเงิน → เพิ่ม currency + base equivalent
```sql
-- ตัวอย่างบน payments (ตารางอื่น: bookings/folio_items/invoices ทำแบบเดียวกัน)
-- amount_satang        bigint   -- ยอดในสกุล presentment
-- currency             char(3)  -- สกุลที่จ่ายจริง เช่น 'USD'
-- fx_rate_to_base      numeric  -- rate ที่ freeze ณ ตอนจ่าย
-- amount_base_satang   bigint   -- = amount แปลงเป็น base (คำนวณตอนบันทึก) → ใช้รวมรายงาน
```
- rate_calendar เก็บราคาในสกุล property → booking engine แปลงโชว์ตามสกุลที่แขกเลือก (freeze ตอนจอง)
- night audit / business_day_reports สรุปเป็น **base currency** (แปลงจาก amount_base ที่ freeze ไว้)

### 19.4 ข้อควรระวัง
- **billing SaaS (โรงแรมจ่ายเรา)** = คนละเรื่องกับสกุลที่โรงแรมรับจากแขก → ค่าบริการเก็บ THB ผ่าน Beam ตามเดิม
- OTA แต่ละเจ้ามีสกุลของมัน → ตอน sync (Phase 4) ต้อง map currency ด้วย (abstraction เผื่อไว้แล้ว)
- เก็บ rounding rule ต่อสกุล (บางสกุลไม่มีทศนิยม เช่น JPY)

---

## 20. Guest ID / Overbooking / i18n (ตัดสินแล้ว)

### 20.1 ข้อมูลแขก + PDPA (เก็บเลข + รูปถ่ายบัตร/passport)
```sql
-- guests: name, phone, email, nationality, dob,
--   id_type text,            -- national_id | passport
--   id_number text,          -- เลขบัตร/passport (พิจารณา encrypt at rest)
--   id_photo_url text,       -- รูปถ่ายบัตร (private storage bucket)
--   pdpa_consent_at timestamptz, pdpa_consent_by uuid   -- บันทึก consent
```
- **PDPA**: เก็บ consent timestamp · รูปบัตรใน **private bucket** (signed URL เท่านั้น) · มีปุ่มลบข้อมูล (right to erasure) · จำกัดสิทธิ์ดูรูปบัตร (permission `guests.view_id`)
- ใช้เลข/รูปเพื่อ report ทะเบียนผู้เข้าพัก (ตม./ราชการ) ได้

### 20.2 Overbooking — กันเข้ม (ห้ามจองเกินห้องว่าง)
- ตัด inventory ใน **transaction เดียว** + lock แถว `rate_calendar` ของวันนั้น → ถ้าห้องว่าง 0 ปฏิเสธการจองทันที
- ครอบคลุมทุกทาง: จองตรง (front desk + booking engine) และ OTA import (Phase 4)
- **หมายเหตุ Phase 4**: การต่อ OTA หลายช่องมีความเสี่ยง overbooking โดยธรรมชาติ (delay การ sync) → กันด้วย single source of truth = `rate_calendar` ของเรา + sync แบบ near-real-time; ไม่เปิดโหมด overbook buffer

### 20.3 i18n — ไทย + อังกฤษ ตั้งแต่แรก
- ยืม `next-intl` (cookie-based, ไม่มี locale ใน URL) จาก aoosocial
- ครอบทั้ง **หลังบ้าน PMS** และ **booking engine** (แขกต่างชาติเลือกภาษาได้)
- โครง i18n เผื่อเพิ่มภาษา (จีน/ญี่ปุ่น) Phase หลังได้

---

## 21. Gap Analysis รอบ 2 (2026-07-14) — feature ที่รีวิวแล้วเพิ่มเข้าแบบ

รีวิวทุก flow เทียบ PMS จริง (guest จอง → front desk → check-in/out → folio → night audit → housekeeping → OTA → billing) เจอช่องว่าง 10 จุด — ทั้งหมดถูกรวมเข้า scope แล้วดังนี้

### 21.1 ภาษี + Service Charge (Phase 1 — สำคัญมากสำหรับโรงแรมไทย)
- ตั้งค่าต่อสาขา: `properties.vat_percent` (7), `properties.service_charge_percent` (0/10), และ **โหมดราคา**: `tax_inclusive` (ราคาที่ตั้งรวมภาษีแล้ว) หรือ exclusive (บวกเพิ่มตอนคิดเงิน)
- ทุก `folio_items` เก็บ snapshot: `vat_satang`, `service_charge_satang` (คำนวณ ณ ตอน post — เปลี่ยน % ทีหลังไม่กระทบย้อนหลัง)
- ใบเสร็จ/ใบกำกับภาษีแตกยอด ราคาห้อง / SC / VAT ถูกต้องตามสรรพากร

### 21.2 Booking Hold Expiry (Phase 1)
- booking `pending` (รอจ่ายมัดจำ) มี `hold_expires_at` — เกินกำหนด (เช่น 30 นาที สำหรับ online / ตั้งได้สำหรับ front desk) → cron ตั้ง `expired` + **คืน inventory อัตโนมัติ**
- กันเคสจองค้าง block ห้องคนอื่นตลอดไป

### 21.3 บัญชีรับเงินของโรงแรม (Phase 3 — ก่อนเปิด booking engine)
- **เงินแขกเข้าบัญชีโรงแรมโดยตรง ไม่ผ่านแพลตฟอร์ม** (เราไม่จับเงิน ไม่ต้องขอ license payment facilitator)
- `property_payment_configs`: PromptPay ID/เบอร์/เลขบัญชี (สร้าง QR ให้แขกสแกน → อัพสลิป → พนักงาน verify), และ/หรือ Beam merchant credentials **ของโรงแรมเอง** (ถ้าโรงแรมสมัคร Beam → รับบัตร/QR ยืนยันอัตโนมัติ)
- แพลตฟอร์มเก็บแค่ค่า subscription (Beam ของเรา) — เส้นเงินแยกขาดกัน

### 21.4 ปิดห้องซ่อม / Maintenance Block (Phase 1)
- `room_blocks`: `room_id`, `date_range`, `reason (maintenance|renovation|private)`, `created_by`
- block แล้ว = ตัดออกจาก availability ทุกช่องทาง (นับเหมือนห้องถูกใช้ ใน rate_calendar)
- ต่างจาก `rooms.status = out_of_order` (สถานะปัจจุบัน) — block เป็น **ช่วงวันที่ล่วงหน้า**

### 21.5 ราคาตามจำนวนคน (Phase 1)
- `room_types`: `base_occupancy` (ราคาพื้นฐานรวมกี่คน), `max_occupancy`, `extra_adult_satang`, `extra_child_satang`, `child_age_limit`
- ตอนจองเลือกผู้ใหญ่/เด็ก → ระบบคิดส่วนเกินอัตโนมัติ → OTA ก็ใช้ model นี้ (มาตรฐาน ARI)

### 21.6 Rate Model แยก Availability กับ Price ให้ชัด (Phase 1 — โครงสร้างสำคัญ)
เดิม `rate_calendar` ผูก inventory+ราคาไว้ด้วยกัน → แยกเป็น 2 ตาราง (ตรงมาตรฐาน ARI ของ OTA):
```
room_type_inventory (room_type_id, date)         ← ห้องว่าง/จองแล้ว/block — ต่อ room_type
  · total, booked, blocked → available = total - booked - blocked
rate_prices (rate_plan_id, room_type_id, date)   ← ราคา — ต่อ rate_plan
  · price_satang, min_stay, closed_to_arrival/departure, stop_sell
```
- 1 room_type มีหลาย rate_plan (Flexible / Non-refundable / รวมอาหารเช้า) ราคาต่างกัน แต่ดึงห้องจาก pool เดียวกัน
- จองเข้ามาไม่ว่า rate plan ไหน → ตัด `room_type_inventory` ที่เดียว → ARI sync ไป OTA อ่านจากคู่นี้ตรงๆ

### 21.7 ระบบแจ้งเตือน / อีเมล (Phase 1 เริ่ม, ครบ Phase 3)
- **Resend** (ตาม aoosocial): ยืนยันการจอง (แขก + โรงแรม), แจ้งยกเลิก+ยอดคืน, เตือนก่อนเข้าพัก 1 วัน, แจ้งสลิปรอ verify
- `notification_settings` ต่อสาขา (เปิด/ปิดรายเหตุการณ์) + in-app notification hub Phase หลัง
- Template 2 ภาษา (ตาม locale แขก)

### 21.8 โปรโมโค้ดของโรงแรม (Phase 3 — คนละตัวกับ coupon SaaS)
- `promo_codes` (hotel-scoped): code, ประเภทส่วนลด (percent/fixed), ช่วงวันที่ใช้/เข้าพัก, จำกัดจำนวนครั้ง, ขั้นต่ำกี่คืน
- ใช้ใน booking engine (จุดขายให้จองตรง) · แยกขาดจาก `coupons` ของ platform billing

### 21.9 Audit Log (Phase 1)
- `audit_logs`: hotel_id, actor, action, entity(type+id), diff (jsonb), created_at
- บังคับ log: แก้/ยกเลิก booking, refund, void folio item, แก้ราคา, เปลี่ยน permission, เปลี่ยนสมาชิก
- superadmin + owner ดูได้ · ตอบคำถาม "ใครไปแก้ราคาวันนั้น" ได้เสมอ

### 21.10 Ops Inventory — Storage Buckets + Cron Jobs
**Buckets (Supabase Storage):**
| Bucket | Public? | เก็บ |
|--------|---------|------|
| `room-photos` | public | รูปห้อง/สาขา (booking engine) |
| `payment-slips` | private (signed URL) | สลิปโอน |
| `guest-ids` | private + จำกัดสิทธิ์ `guests.view_id` | รูปบัตร/passport (PDPA) |
| `housekeeping-photos` | private | รูปยืนยันงานแม่บ้าน |

**Cron jobs (`/api/cron/*`):**
| Job | ความถี่ | ทำอะไร |
|-----|---------|--------|
| `expire-holds` | ทุก 5-10 นาที | ปล่อย booking pending ที่เกิน hold (§21.2) |
| `night-audit` | รายชั่วโมง (เช็ค cutoff แต่ละสาขา) | ปิดยอด business day อัตโนมัติ (§16) |
| `billing-downgrade` | รายวัน | subscription หมดอายุ → grace → downgrade (ตาม aoosocial) |
| `fx-rates` | รายวัน | อัปเดตอัตราแลกเปลี่ยน (§19) |
| `arrival-reminders` | รายวัน | อีเมลเตือนก่อนเข้าพัก (§21.7) |
| `ota-sync` | Phase 4 | ARI sync + ดึง reservation |

---

## 12. สิ่งที่ต้อง build ใหม่ (ไม่มีใน aoosocial)

- **โดเมนโรงแรม**: rooms / room_types / rate_calendar / bookings / booking_rooms / guests — ไม่มีเลย
- **Inventory calendar** จริง (aoosocial "calendar" = ตัวตั้งเวลาโพสต์ ไม่ใช่ availability)
- **2-level tenant + slug ทั้งสองระดับ** (aoosocial มีระดับเดียว + ไม่มี slug)
- **Configurable permission** (§15) — aoosocial เป็น fixed-enum ต้องเพิ่ม `role_permissions` + `user_can()` + หน้า matrix
- **Payments ledger + folio** (§14, §17) — จ่ายบางส่วน/มัดจำ/refund/ค่าอาหาร
- **Night Audit / business day** (§16) — cutoff 24 ชม. + รายงานสิ้นวัน
- **Housekeeping + หน้าแม่บ้านถ่ายรูปยืนยัน** (§18) — camera capture + timestamp/GPS
- **Booking Engine หน้าบ้าน public** + payment flow ของแขก
- **Channel Manager / OTA sync layer**

**สิ่งที่ยืมได้ทั้งชุด:** Auth + Google OAuth · RLS helper 4 ตัว + policy triplet · packages + overrides + resolver · superadmin subtree + guard · billing (Beam/PromptPay/ใบกำกับภาษี) · middleware/JWT cache · Supabase client factories

---

## 13. ข้อควรตัดสินใจต่อ (open questions)

**ตัดสินใจแล้ว (lock):**
- ✅ **มัดจำ** = ยืดหยุ่นต่อ rate plan (§14.3) · **ยกเลิก/คืนเงิน** = policy ต่อ rate plan + คำนวณอัตโนมัติ (§14.4)
- ✅ **ช่องทางชำระ** = cash / โอน+สลิป / รูดบัตร / PromptPay QR / online / WeChat / Alipay (§14.5)
- ✅ **Refund** = บันทึกในระบบ + คืนจริงนอกระบบ (§14.7)

- ✅ **Permission** = fixed role preset + ติ๊กสิทธิ์ได้ · UI "ข้างในละเอียด ข้างนอกง่าย" (§15)
- ✅ **Billing SaaS** = Beam/PromptPay ตาม aoosocial (renewal manual + grace + cron downgrade)
- ✅ **Multi-currency เต็มตั้งแต่แรก** (§19) — ทุกจุดที่แตะเงินมี `currency` + เก็บ FX rate
- ✅ **สาขา-scope role** = Phase หลัง แต่เผื่อ schema `member_property_access` ไว้ (§4)
- ✅ **OTA** = ตัดสินใจ partner-vs-direct ตอน Phase 4 (abstraction วางไว้แล้ว §8)
