# PLAN — แผน implement ละเอียด (ไล่ทีละ step)

> คู่กับ [BLUEPRINT.md](BLUEPRINT.md) (ออกแบบ) และ [IMPLEMENTATION-NOTES.md](IMPLEMENTATION-NOTES.md) (ข้อควรระวัง — **อ่าน § ที่อ้างถึงก่อนทำทุก step**)
> ติ๊ก checkbox ในไฟล์นี้ + อัปเดต [memo/devplan.md](../memo/devplan.md) เมื่อจบแต่ละ step
> ขนาดงาน: 🟢 เล็ก (ชม.) · 🟡 กลาง (ครึ่ง-1 วัน) · 🔴 ใหญ่ (1-3 วัน)
> อัปเดต: 2026-07-14

**กติกาต่อ 1 step = 1 commit:**
1. `pnpm build` ผ่าน
2. ถ้าแตะ DB → `pnpm db:types` regen + เทสต์ RLS 2-user (NOTES §3)
3. action สำคัญลง `log_audit()` (NOTES §11.6 — convention `entity.verb`)
4. เจอกับดักใหม่ → จด `memo/bugs.md`

---

## STEP 0 — เชื่อม Supabase จริง 🟢 (ทำก่อนทุกอย่าง — NOTES §2)

- [ ] 0.1 สร้าง Supabase project → ใส่ URL + Publishable + Secret key ใน `.env.local`
- [ ] 0.2 Google Cloud Console → OAuth Client → redirect `https://<ref>.supabase.co/auth/v1/callback` → ใส่ใน Supabase Auth Providers
- [ ] 0.3 Supabase Auth → URL Configuration: Site URL + `http://localhost:3000/auth/callback`
- [ ] 0.4 `pnpm db:link` → `pnpm db:push` (migrations 000001–000007)
- [ ] 0.5 `pnpm db:types` — **ทับ placeholder `any`** ใน `src/types/database.ts`
- [ ] 0.6 SQL editor: `update profiles set is_super_admin = true where email = 'amgovenger@gmail.com';`
- [ ] 0.7 ตั้ง `CRON_SECRET` ใน `.env.local`

**เกณฑ์เสร็จ:** login Google → onboarding → สร้างโรงแรม (ได้ owner อัตโนมัติ) → dashboard โชว์ชื่อ+role · `/super-admin/dashboard` เข้าได้ · `/settings/package?h=<slug>` อัพเกรด dev-mode ผ่าน + เห็น log ใน `audit_logs` · user คนที่ 2 มองไม่เห็นโรงแรมคนแรก

---

## GROUP A — จบ Phase 0 (UI ที่เหลือ)

### A1. settings/team — จัดการสมาชิก 🟡
- ไฟล์: `src/app/(app)/settings/team/{page.tsx, actions.ts, members-list.tsx}`
- [ ] รายชื่อสมาชิก (join `hotel_members` + `profiles`) + role badge
- [ ] เปลี่ยน role (dropdown — **ห้ามมี owner ให้เลือก**, owner เปลี่ยนใครไม่ได้ถ้าตัวเองไม่ใช่ owner/admin)
- [ ] ลบสมาชิก (กันลบ owner + กันลบตัวเองถ้าเป็น owner คนเดียว) / ปุ่ม "ออกจากโรงแรม"
- [ ] เช็ค limit `max_team_members` ผ่าน resolver (A5) ก่อนแสดงปุ่มเชิญ
- [ ] log: `member.role_changed`, `member.removed`, `member.left`
- **เกณฑ์เสร็จ:** เปลี่ยน role แล้ว user นั้น refresh เห็นสิทธิ์เปลี่ยน · viewer มองไม่เห็นปุ่มจัดการ

### A2. Invite link 🟡 (RPC `accept_invite` มีแล้ว — migration 000006)
- ไฟล์: `settings/team/invite-section.tsx` + `src/app/invite/[token]/page.tsx` + action
- [ ] สร้าง link: `crypto.randomBytes(32).toString("base64url")` → insert `invites` (role ที่เลือก, `max_uses=1`, หมดอายุ 7 วัน) → โชว์ URL `/invite/<token>` + ปุ่ม copy
- [ ] หน้า `/invite/[token]`: แสดงชื่อโรงแรม+role → ปุ่มรับคำเชิญ → เรียก RPC `accept_invite` → redirect dashboard
- [ ] เคส: ยังไม่ login → proxy ส่งไป `/login?redirect=/invite/<token>` กลับมาแล้วต้องรับต่อได้ (path `/invite/` เป็น public ใน proxy แล้ว — เช็คว่า flow ครบจริง)
- [ ] แสดง error สวยๆ: `invite_used_up` / `invite_expired` / `invite_not_found`
- [ ] log: `invite.created`, `invite.accepted`
- **เกณฑ์เสร็จ:** user ใหม่ (บัญชี Google อื่น) รับ invite ได้จบวง · ใช้ซ้ำครั้งที่ 2 ขึ้น "ถูกใช้แล้ว"

### A3. Permission system ฝั่ง app + หน้า settings/roles 🔴 (NOTES §5 + BLUEPRINT §15)
- ไฟล์: `src/lib/permission/index.ts` + `settings/roles/{page.tsx, actions.ts, simple-toggles.tsx, advanced-matrix.tsx}`
- [ ] lib: `can(hotelId, permission)` (เรียก RPC `user_can`, cache ต่อ request ด้วย React `cache()`) + `requirePermission(hotelId, permission)` (throw ถ้าไม่ผ่าน)
- [ ] นิยาม **กลุ่ม toggle** เป็น const เดียว (BLUEPRINT §15.4): จัดการการจอง / ยกเลิก&คืนเงิน / รับชำระเงิน / ตั้งราคา&ห้อง / ดูรายงาน / ตั้งค่า&ทีม → map ไป permission keys
- [ ] หน้า simple (default): การ์ด role × toggle กลุ่ม — สถานะกลุ่ม = ถ้า key ข้างในไม่ตรงกันหมดให้โชว์ **indeterminate** (NOTES §5)
- [ ] หน้า advanced (ซ่อนใต้ปุ่ม): matrix เต็ม checkbox รายคีย์
- [ ] toggle/ติ๊ก → action upsert `role_permissions` (1 toggle = หลาย row) → `revalidatePath`
- [ ] owner column ล็อก (โชว์ติ๊กเต็ม กดไม่ได้)
- [ ] log: `permission.changed` (old/new)
- **เกณฑ์เสร็จ:** ปิด "ยกเลิก&คืนเงิน" ของ front_desk → RPC `user_can(h,'bookings.cancel')` คืน false ทันที · เปิดกลับได้ · advanced ติ๊กรายคีย์แล้ว simple โชว์ผสม

### A4. Package resolver + limit guards 🟢 (NOTES §11.5)
- ไฟล์: `src/lib/package/resolve-access.ts`
- [ ] `resolveAccess(hotelId)` → อ่าน `hotels.package_id` → `packages` + `hotel_package_overrides` → คืน effective `{maxProperties, maxRooms, maxTeamMembers, maxOtaChannels, allowBookingEngine, ...}` ด้วย `COALESCE(override, default)` — **ที่เดียวในระบบ**
- [ ] helper `assertWithinLimit(hotelId, 'properties' | 'rooms' | 'members')` — นับ usage แล้ว throw ข้อความไทยถ้าเต็ม (จะถูกเรียกจาก A1, B1, B2)
- **เกณฑ์เสร็จ:** ตั้ง override ผ่าน SQL แล้วค่า effective เปลี่ยนโดยไม่แตะ package

### A5. Super-admin pages 🟡
- ไฟล์: `src/app/super-admin/{hotels/page.tsx, hotels/[hotelId]/page.tsx, packages/page.tsx, audit/page.tsx}`
- [ ] hotels: ตารางทุกโรงแรม (ชื่อ/slug/แพ็กเกจ/สมาชิก/สร้างเมื่อ) + ค้นหา — ใช้ admin client
- [ ] hotels/[hotelId]: รายละเอียด + สมาชิก + subscription + invoices + ปุ่ม "เปลี่ยนแพ็กเกจ" (เรียก `apply_package_change` reason `superadmin`) + ฟอร์ม override
- [ ] packages: CRUD (แก้ราคา/limit/flag — ระวัง: แก้แล้วมีผลทุกโรงแรมใน tier ทันที)
- [ ] audit: ตาราง `audit_logs` ทั้งระบบ + filter ตาม hotel/action
- **เกณฑ์เสร็จ:** เปลี่ยนแพ็กให้โรงแรมหนึ่งจากหน้า admin แล้วโรงแรมนั้นเห็น limit ใหม่ + มี log

> **จบ GROUP A = Phase 0 สมบูรณ์** — อัปเดต devplan แล้วค่อยเริ่ม B

---

## GROUP B — Phase 1 DB ทั้งหมด (ทำ DB ให้จบก่อนแตะ UI — NOTES §11 ข้อ 5)

### B1. Migration `000008_properties.sql` 🟡
- [ ] `properties`: id, hotel_id, **slug** (unique per hotel: `unique(hotel_id, slug)`), name, address, phone, timezone (`default 'Asia/Bangkok'`), default_currency char(3) null, check_in_time/check_out_time time, **vat_percent numeric default 7, service_charge_percent numeric default 0, tax_inclusive boolean default true** (§21.1), business_day_cutoff time default '06:00', night_audit_mode text default 'both', is_active, deleted_at
- [ ] RLS triplet (member-select / `user_can(hotel_id,'settings.properties')`-write / superadmin)
- [ ] แก้ `check_package_fits()`: เพิ่มนับ properties (ลบ TODO ใน 000007)
- **⚠️:** ทุกตารางใต้ property ใส่ **ทั้ง `hotel_id` และ `property_id`** (hotel_id ไว้ RLS+report — BLUEPRINT §9)

### B2. Migration `000009_rooms.sql` 🟡
- [ ] `room_types`: hotel_id, property_id, name, description, **base_occupancy int, max_occupancy int, extra_adult_satang bigint default 0, extra_child_satang bigint default 0, child_age_limit int** (§21.5), amenities jsonb, photos jsonb, sort_order
- [ ] `rooms`: hotel_id, property_id, room_type_id, room_number, floor, housekeeping_status (`clean|dirty|inspected|out_of_order` default clean), is_active
- [ ] `room_blocks` (§21.4): room_id, hotel_id, start_date, end_date (exclusive), reason (`maintenance|renovation|private`), note, created_by — **exclusion constraint กันช่วงซ้อน:** `exclude using gist (room_id with =, daterange(start_date, end_date) with &&)` (ต้อง `create extension btree_gist`)
- [ ] RLS: write = `user_can(hotel_id,'rooms.edit')`
- [ ] แก้ `check_package_fits()`: เพิ่มนับ rooms

### B3. Migration `000010_rates_inventory.sql` 🔴 (หัวใจ — BLUEPRINT §21.6 + NOTES §4)
- [ ] `rate_plans`: hotel_id, property_id, name, description, **deposit_policy jsonb** (§14.3), **cancellation_policy jsonb** (§14.4), include_breakfast boolean, is_active, sort_order
- [ ] `rate_prices`: hotel_id, rate_plan_id, room_type_id, date, price_satang, currency, min_stay int default 1, closed boolean default false — `unique(rate_plan_id, room_type_id, date)`
- [ ] `room_type_inventory`: hotel_id, property_id, room_type_id, date, total int, booked int default 0, blocked int default 0 — `unique(room_type_id, date)` + **check `booked + blocked <= total`** (constraint นี้คือกันชน overbooking ชั้นสุดท้าย)
- [ ] function `ensure_inventory(p_room_type_id, p_until date)`: upsert แถวถึงวันที่กำหนด, `total` = จำนวน rooms active ของ type — เรียกตอน (ก) สร้าง/แก้ rooms (ข) cron รายวัน extend horizon 400 วัน
- [ ] trigger บน `rooms` (insert/update/delete) → recalc `total` ของวันอนาคตทั้งหมด **⚠️ ห้ามแตะวันที่ผ่านแล้ว**
- [ ] trigger บน `room_blocks` → บวก/ลบ `blocked` ของช่วงวัน (ใน transaction เดียวกับ insert/delete block — ถ้า `booked+blocked > total` ให้ fail = มีแขกอยู่ห้ามปิดซ่อม)
- [ ] RLS: write = `user_can(hotel_id,'rates.edit')` (rate_prices/rate_plans) — inventory เขียนผ่าน function เท่านั้น (no authenticated write)

### B4. Migration `000011_guests_storage.sql` 🟡 (§20.1 + NOTES §9)
- [ ] `guests`: hotel_id, full_name, phone, email, nationality char(2), locale, dob, id_type (`national_id|passport`), id_number, id_photo_path, pdpa_consent_at, pdpa_consent_by, note — index (hotel_id, phone), (hotel_id, email)
- [ ] RLS: select/edit = `guests.view/edit` · **`id_number`+`id_photo_path` อ่านผ่าน view หรือ column-level ด้วย `user_can(...,'guests.view_id')`** (ง่ายสุด: view `guests_safe` ไม่มีคอลัมน์ id + หน้าไหนต้องการ id ค่อย query ตรง+เช็คสิทธิ์)
- [ ] สร้าง 4 buckets + storage policies (path เริ่มด้วย `{hotel_id}/` — NOTES §9): `room-photos`(public) / `payment-slips` / `guest-ids` / `housekeeping-photos`
- **⚠️:** bucket สร้างผ่าน dashboard หรือ migration `insert into storage.buckets` — เขียน storage policy อิง `(storage.foldername(name))[1]::uuid` เทียบ membership

### B5. Migration `000012_bookings.sql` 🔴 (BLUEPRINT §14 + §17)
- [ ] enums: `booking_status` (§14.1), `payment_method` (§14.5), `booking_channel` (`front_desk|phone|walk_in|booking_engine|ota_agoda|ota_booking|ota_trip|ota_other`)
- [ ] `bookings`: hotel_id, property_id, code text unique (gen สั้นอ่านง่าย เช่น `BK-XXXXXX`), guest_id, channel, status, check_in date, check_out date, adults, children, currency, fx_rate_to_base, total_satang, deposit_due_satang, **hold_expires_at** (§21.2), cancelled_at, cancel_reason, no_show_at, created_by, timestamps
- [ ] `booking_rooms` (segment — รองรับ mid-stay move §14.9): booking_id, hotel_id, room_type_id, rate_plan_id, room_id null (assign ตอน check-in), start_date, end_date, price_per_night_satang, nights int
- [ ] `folios` + `folio_items` (§17.1 + **vat_satang, service_charge_satang** snapshot §21.1)
- [ ] `payments` (ledger §14.6): direction, amount_satang, currency, fx_rate_to_base, amount_base_satang, method, status, slip_path, gateway_ref, reference_payment_id, received_by, confirmed_at, confirmed_by
- [ ] RLS: select=member · **write ทุกตาราง = ผ่าน RPC เท่านั้น** (no authenticated direct write) — กัน logic หลุด transaction

### B6. Migration `000013_booking_rpcs.sql` 🔴🔴 (ชิ้นยากสุดของระบบ — NOTES §4 ทั้งหมด)
ทุกตัว: `security definer` + เช็ค `user_can()` ข้างใน + lock inventory `FOR UPDATE` + `log_audit()` + คืนค่าเป็น jsonb

- [ ] `create_booking(p_hotel_id, p_property_id, p_room_type_id, p_rate_plan_id, p_check_in, p_check_out, p_rooms int, p_adults, p_children, p_guest jsonb, p_channel, p_hold_minutes int default null) → jsonb {booking_id, code, total_satang, deposit_due_satang}`
  ลำดับใน function: เช็คสิทธิ์ → lock inventory `[check_in, check_out)` → เช็ค available ทุกวัน → คำนวณราคา (rate_prices + extra occupancy §21.5) + มัดจำ (deposit_policy) → upsert guest → insert booking (+hold ถ้า pending) + booking_rooms + folio + folio_items ค่าห้อง (พร้อม VAT/SC snapshot) → `booked+1` ทุกวัน → log `booking.created`
  **⚠️ off-by-one:** loop วัน `< check_out` ไม่ใช่ `<=`
- [ ] `cancel_booking(p_booking_id, p_reason) → jsonb {refund_satang}` — คำนวณยอดคืนจาก cancellation_policy (§14.4) เทียบวันนี้ vs check_in → คืน inventory → status cancelled → สร้าง payments refund (pending) ถ้ามียอดคืน → log
- [ ] `change_booking_dates(p_booking_id, p_new_check_in, p_new_check_out) → jsonb {diff_satang}` — lock ทั้งช่วงเก่า+ใหม่ **ใน transaction เดียว** → เช็คว่างช่วงใหม่ → คืนเก่า/ตัดใหม่ → คำนวณราคาใหม่+ปรับ folio → log `booking.dates_changed`
- [ ] `move_room(p_booking_id, p_new_room_type_id, p_from_date default null)` — null = ทั้ง booking, มีค่า = mid-stay split segment (§14.9) → log
- [ ] `check_in_booking(p_booking_id, p_room_assignments jsonb)` — guard status=confirmed → assign room_id ลง booking_rooms → status checked_in → log
- [ ] `check_out_booking(p_booking_id)` — guard checked_in → เช็ค folio balance = 0 (ไม่ 0 → error "ยังมียอดค้าง") → status checked_out → ห้อง → dirty → log
- [ ] `record_payment(p_booking_id, p_amount_satang, p_currency, p_method, p_slip_path, p_note) → payment_id` — status: cash/card_terminal = confirmed ทันที · bank_transfer = pending (รอ verify) → อัปเดต folio totals → log `payment.recorded`
- [ ] `verify_slip_payment(p_payment_id, p_approve boolean)` — เช็ค `payments.verify_slip` → confirmed/failed → log
- [ ] `refund_payment(p_payment_id_ref, p_amount_satang, p_method, p_note) → payment_id` — เช็ค `payments.refund` + ยอดรวม refund ≤ ยอด charge ก้อนนั้น (NOTES §6) → log
- [ ] `post_folio_item(p_booking_id, p_category, p_description, p_qty, p_unit_price_satang)` / `void_folio_item(p_item_id, p_reason)` — void ห้ามลบ row (§17) → log
- [ ] `expire_booking_holds()` — เรียกจาก cron: pending + hold เกิน → expired + คืน inventory (idempotent — เช็ค status ก่อน §21.2)

### B7. Cron routes 🟢
- [ ] `/api/cron/expire-holds` (ทุก 5-10 นาที) → RPC `expire_booking_holds()`
- [ ] `/api/cron/extend-inventory` (รายวัน) → `ensure_inventory()` ทุก room_type ถึง +400 วัน
- ทั้งคู่ใช้ CRON_SECRET pattern เดียวกับ `/api/cron/billing`

> **จบ GROUP B:** `pnpm db:types` → เขียน SQL test สร้าง booking 2 อันชนวันกันใน room สุดท้าย → อันที่ 2 ต้อง fail

---

## GROUP C — Phase 1 UI (ตามลำดับใช้จริง)

### C1. App shell + sidebar nav 🟡
- ไฟล์: `src/app/(app)/layout.tsx` + `components/app-shell.tsx` + property switcher
- [ ] sidebar: ภาพรวม/ปฏิทิน/การจอง/หน้าเคาน์เตอร์/แม่บ้าน/ห้องพัก/ราคา/แขก/รายงาน/ตั้งค่า — ทุก link ผ่าน `hotelHref()` + ซ่อนเมนูตามสิทธิ์ (`can()`) และ property switcher (dropdown เก็บ active property ใน cookie หรือ `?p=`)
- **⚠️ (NOTES/aoosocial):** layout ไม่ได้รับ searchParams → guard ยังอยู่ระดับ page ทุกหน้า, layout โหลดแค่ chrome
- [ ] จด shared components ที่เกิดใหม่ลง `memo/component.md` (Button, Card, Table, Modal, Badge...)

### C2. settings/properties — CRUD สาขา 🟡
- [ ] สร้าง/แก้/ปิดสาขา + ตั้ง timezone, เวลา check-in/out, **VAT/SC/tax_inclusive** (โชว์คำอธิบายชัดๆ ว่าราคาที่ตั้ง "รวม" หรือ "ยังไม่รวม" ภาษี — NOTES §6), cutoff
- [ ] เรียก `assertWithinLimit('properties')` ก่อนสร้าง · slug สาขา gen จากชื่อ
- [ ] log: `property.created/updated`

### C3. rooms — ประเภทห้อง + ห้อง 🟡
- [ ] room_types CRUD (occupancy pricing ครบ) + อัปโหลดรูปเข้า `room-photos`
- [ ] rooms CRUD (เลขห้อง/ชั้น) + `assertWithinLimit('rooms')` + ปุ่มปิดซ่อม (สร้าง room_block ช่วงวันที่ — โชว์ error ถ้ามีแขกพักช่วงนั้น)
- [ ] log: `room.created`, `room.blocked`

### C4. rates — rate plans + ปฏิทินราคา 🔴
- [ ] rate_plans CRUD: ฟอร์ม deposit_policy (dropdown 5 แบบ §14.3) + cancellation_policy (3 แบบ §14.4 — tiered ให้เพิ่มแถวได้)
- [ ] ตารางราคา: grid room_type × วันที่ (เดือน) ของ rate_plan ที่เลือก → คลิกแก้รายช่อง + **bulk editor**: เลือกช่วงวัน + วันในสัปดาห์ (จ-ศ/ส-อา) → ตั้งราคา/min_stay/closed ทีเดียว (สำคัญมาก — โรงแรมตั้งราคาเป็น season)
- [ ] log: `rates.updated` (เก็บช่วง+ค่าใหม่ใน new_data)

### C5. calendar — ปฏิทินห้องว่าง 🔴
- [ ] grid เดือน: แถว = room_type, ช่อง = วัน → แสดง `available/total` + สีตามระดับ (ว่าง/ใกล้เต็ม/เต็ม/block)
- [ ] คลิกช่อง → popup รายการ booking ของวันนั้น + ปุ่มจองด่วน
- อ่านจาก `room_type_inventory` ตรงๆ (query เดียว/เดือน — เร็ว)

### C6. bookings — สร้าง/จัดการการจอง 🔴🔴 (ใหญ่สุดของ UI)
- [ ] **New booking wizard** (`bookings/new`): ① เลือกสาขา+วัน+ผู้ใหญ่/เด็ก → โชว์ room_type ที่ว่าง+ราคาต่อ rate_plan (query availability สด) → ② ข้อมูลแขก (ค้นเบอร์/อีเมลเจอแขกเก่า → autofill) → ③ สรุป+มัดจำที่ต้องเก็บ → ยืนยัน = เรียก RPC `create_booking` (front desk = confirmed ทันที ไม่มี hold)
- [ ] **Booking list**: filter สถานะ/วัน/ค้นชื่อ+code · badge สี status
- [ ] **Booking detail** (`bookings/[id]`): ข้อมูล+timeline · ปุ่มตามสิทธิ์+สถานะ: แก้แขก / เปลี่ยนวัน (โชว์ diff ราคาให้ยืนยันก่อน — NOTES §4) / ย้ายห้อง / ยกเลิก (**โชว์ยอดคืนตาม policy ให้ยืนยันก่อน**) / check-in (เลือกห้องจาก dropdown ห้องว่าง+clean) / check-out (block ถ้า balance ≠ 0)
- [ ] **Folio tab**: รายการ charge (ค่าห้อง auto + เพิ่มรายการ: อาหาร/มินิบาร์/ซักรีด/spa/อื่น) + void (มีเหตุผล) · payment: รับเงิน (เงินสด/โอน+อัพสลิปเข้า `payment-slips`/รูดบัตร) + verify slip + refund · แถบสรุป: ยอดรวม/จ่ายแล้ว/ค้าง — realtime จาก ledger
- **เกณฑ์เสร็จ:** จองวงจรเต็ม จอง→มัดจำโอน→verify สลิป→check-in→เพิ่มค่าอาหาร→จ่ายส่วนที่เหลือ→check-out ได้จบโดย balance = 0 และทุก action มี log

### C7. front-desk — งานวันนี้ 🟡
- [ ] 3 ลิสต์: เข้าวันนี้ (ปุ่ม check-in) / ออกวันนี้ (ปุ่ม check-out + ยอดค้างแดงถ้ามี) / พักอยู่ (in-house)
- [ ] สรุปหัวหน้า: ห้องว่างคืนนี้ / occupancy วันนี้ / dirty กี่ห้อง

### C8. guests — ทะเบียนแขก 🟡
- [ ] ลิสต์+ค้นหา · หน้า detail: ประวัติการพัก + ฟอร์ม ID (§20.1): เลข+ถ่าย/อัปรูปบัตรเข้า `guest-ids` + ติ๊ก PDPA consent (เก็บ timestamp)
- [ ] รูปบัตรเห็นเฉพาะคนมี `guests.view_id` (signed URL อายุสั้น — NOTES §9) + ปุ่มลบข้อมูล ID (right to erasure)

### C9. reports — รายงานพื้นฐาน 🟡
- [ ] เลือกช่วงวัน+สาขา → occupancy รายวัน, รายได้แยกหมวด (ห้อง/อาหาร/อื่น), รายได้แยกช่องทางชำระ, ยอด refund — query จาก folio_items+payments (ยอด = `amount_base_satang` — NOTES §6)
- [ ] ตาราง + กราฟง่ายๆ พอ (ADR/RevPAR ไป Phase 2 night audit)

### C10. settings/audit — ดู log 🟢
- [ ] ตาราง audit_logs ของโรงแรม (owner/admin) + filter action/คน/ช่วงวัน + แสดง old→new diff

> **จบ GROUP C = Phase 1 MVP ใช้งานจริงได้** (โรงแรมจัดการจองหน้าเคาน์เตอร์ครบวงจร)

---

## GROUP D — Phase 2 Ops (สรุปย่อ — ลงรายละเอียดเพิ่มตอนถึง)

- [ ] D1. Night audit 🔴: migration `business_day_reports` (§16.2) + RPC `close_business_day(property_id, date)` (idempotent, snapshot ยอด) + cron รายชั่วโมงเช็ค cutoff รายสาขา (**timezone — NOTES §7**) + ปุ่มปิดยอด manual + หน้ารายงานย้อนหลัง
- [ ] D2. Housekeeping 🔴: migration tasks+photos (§18.1) + auto-สร้าง task ตอน check-out + หน้ามอบงาน (admin) + **หน้าแม่บ้าน mobile** (`/housekeeping` — งานวันนี้, เริ่ม/ถ่ายรูป `capture="environment"` อัปทันที + EXIF/GPS check — NOTES §8, เสร็จ) + inspected โดยหัวหน้า
- [ ] D3. รายงานขั้น 2 🟡: ADR/RevPAR จาก business_day_reports + export CSV

## GROUP E — Phase 3 Booking Engine (โครง — วางแผนละเอียดอีกทีก่อนเริ่ม)

- E1. `property_payment_configs` (§21.3) + หน้า settings ใส่ PromptPay/บัญชี
- E2. Public route `/[hotelSlug]` + `/[hotelSlug]/[propertySlug]` (ระวัง: proxy ต้องปล่อย public + **RLS ต้องมี anon read policy เฉพาะข้อมูลที่โชว์หน้าเว็บ**: hotels/properties/room_types/rate_prices/inventory — คิด policy ใหม่ตอนนั้น)
- E3. Search availability (anon RPC read-only) → เลือกห้อง → กรอกข้อมูล → `create_booking` เวอร์ชัน public (hold 30 นาที + rate limit + turnstile กัน bot)
- E4. จ่ายมัดจำ: PromptPay QR ของโรงแรม → อัพสลิป → หน้า verify ของพนักงาน / Beam ของโรงแรม (ถ้าตั้งค่า)
- E5. หน้า guest จัดการการจอง (code + email lookup) + ยกเลิกเอง (ตาม policy)
- E6. อีเมลครบชุด (ยืนยัน/ยกเลิก/เตือนก่อนเข้าพัก — Resend + template 2 ภาษา §21.7) + promo codes (§21.8)

## GROUP F — Phase 4 OTA (ตัดสินใจ partner ตอนถึง — BLUEPRINT §8)

---

## ภาพรวมลำดับ + dependency

```
STEP 0 ─→ A1 ─→ A2          (team ก่อน invite)
      └→ A4 ─→ A3, A5       (resolver ก่อน เพราะ A1/B1/B2 เรียกใช้)
A จบ ─→ B1 → B2 → B3 → B4 → B5 → B6 → B7   (ตามลำดับ FK)
B จบ ─→ C1 → C2 → C3 → C4 → C5 → C6 → C7 → C8 → C9 → C10
C จบ = MVP ─→ D ─→ E ─→ F
```

**คำแนะนำสุดท้าย:** ถ้าอยากเห็นผลไว ทำ "เส้นแคบสุดถึง booking แรก": STEP 0 → A4(resolver) → B1 → B2 → B3 → B5 → B6(แค่ `create_booking`) → C2 → C3 → C4(ราคาแบบง่าย) → C6(wizard) แล้วค่อยวนกลับมาเก็บ A1-A3, C5, C7-C10
