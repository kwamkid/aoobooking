# Implementation Notes — รายละเอียด + ข้อควรระวัง (สำหรับไล่ implement)

> คู่มือลงมือทำ คู่กับ [BLUEPRINT.md](BLUEPRINT.md) (ออกแบบ) — ไฟล์นี้คือ "ทำยังไง + ระวังอะไร"
> อัปเดต: 2026-07-14

---

## 0. หลักการที่ห้ามหลุด (ท่องไว้ก่อนเขียนทุกไฟล์)

1. **เงิน = satang (bigint) เสมอ** — ห้าม float ทุกกรณี, ทุก amount มี `currency` + `amount_base_satang` (freeze FX)
2. **RLS-first** — ทุกตาราง tenant มี `hotel_id` + policy triplet; ห้ามพึ่ง filter ฝั่ง app อย่างเดียว
3. **สิทธิ์/เงินเช็ค 3 ชั้น** — DB (`user_can()`) + app (`requirePermission()`) + UI (ซ่อนปุ่ม)
4. **inventory = transaction เดียว + lock** — ทุกทางที่แตะห้องว่าง
5. **ledger ห้ามแก้/ลบ** — payments/folio แก้ = เพิ่ม row ใหม่ (void/refund) เท่านั้น

กฎเต็ม: [memo/rules.md](../memo/rules.md)

---

## 1. Tenant & Onboarding (ทำแล้ว — อ่านให้เข้าใจก่อนแตะ)

**พฤติกรรมปัจจุบัน (ถูกต้องแล้ว อย่าแก้กลับ):**
- คนสร้าง hotel = **owner อัตโนมัติ** ผ่าน DB trigger `on_hotel_created` (`20260714000001_core_identity.sql`)
- ฝั่ง app (`onboarding/actions.ts`) **ห้าม insert `hotel_members` เอง** — trigger ทำให้แล้ว ถ้า insert ซ้ำจะเจอ RLS block (บันทึกใน [memo/bugs.md](../memo/bugs.md) แล้ว)

**⚠️ ข้อควรระวัง:**
- `hotels_select_members` policy ต้องมี `owner_id = auth.uid()` เสมอ — เพราะตอน `insert().select()` (RETURNING) AFTER trigger ยังไม่ทันมองเห็น membership → ถ้าเอาออก insert จะ error ทั้งที่ข้อมูลเข้าแล้ว
- **Reserved slugs**: booking engine ใช้ `/[hotelSlug]` ที่ root → slug ห้ามชน route ระบบ (`login`, `api`, `super-admin`, ...) — มี `RESERVED_SLUGS` ใน `onboarding/actions.ts` แล้ว **ถ้าเพิ่ม route ใหม่ที่ root ต้องเพิ่มในลิสต์นี้ด้วยทุกครั้ง**
- **อย่าให้เปลี่ยน slug ง่ายๆ** — slug อยู่ใน URL ที่โรงแรมแจกลูกค้า/พิมพ์ QR ไปแล้ว ถ้าจะมี feature เปลี่ยน slug ต้องเตือนหนักๆ + เก็บ slug เก่า redirect (Phase หลัง)
- ตอนเช็ค limit `max_properties`/`max_rooms` ให้เช็คผ่าน **resolver ตัวเดียว** (§5 ด้านล่าง) ก่อน insert เสมอ

---

## 2. เชื่อม Supabase จริง (ตอนนี้เป็น placeholder — ขั้นตอนตอนพร้อม)

1. สร้าง project ที่ supabase.com → เอา **URL + Publishable key + Secret key** (key format ใหม่ — เมนู Settings → API Keys) ใส่ `.env.local`
2. **Google OAuth**: Google Cloud Console → สร้าง OAuth Client (Web) → Authorized redirect URI = `https://<project-ref>.supabase.co/auth/v1/callback` → เอา client id/secret ไปใส่ Supabase Dashboard → Authentication → Providers → Google
3. Supabase Dashboard → Authentication → URL Configuration → Site URL = `http://localhost:3000` (prod ค่อยเปลี่ยน) + Redirect URLs เพิ่ม `http://localhost:3000/auth/callback`
4. `pnpm db:link` → `pnpm db:push` (apply migrations ทั้ง 6 ไฟล์ตามลำดับ)
5. `pnpm db:types` → **ทับ `src/types/database.ts`** (ตอนนี้เป็น `any` placeholder — งานแรกหลังต่อ DB คือ regen เพื่อได้ type จริง)
6. ตั้ง superadmin ให้ตัวเอง (SQL Editor เท่านั้น — ไม่มี UI โดยตั้งใจ):
   ```sql
   update profiles set is_super_admin = true where email = 'amgovenger@gmail.com';
   ```

**⚠️ ข้อควรระวัง:**
- `database.ts` ที่เป็น `any` ทำให้ **typo ชื่อ column ไม่ถูกจับ** — รีบ regen ทันทีที่มี DB แล้วห้าม commit ทับกลับเป็น `any`
- หลัง**ทุก migration ใหม่** ต้อง `pnpm db:types` ซ้ำเสมอ ไม่งั้น type กับ DB จะเหลื่อมกัน
- `.env.local` มี secret key — อยู่ใน `.gitignore` แล้ว ห้ามย้ายค่าไปไฟล์อื่นที่ commit

---

## 3. RLS — กับดักประจำ

- **helper ที่อ่าน `hotel_members`/`profiles` ต้องเป็น `SECURITY DEFINER set search_path = public`** — ไม่งั้น recursion (policy เรียก function → function อ่านตารางที่มี policy → เรียก function → ...)
- **service-role client (`admin.ts`) bypass RLS ทั้งหมด** — ใช้เฉพาะ cron/webhook/superadmin dashboard; ห้าม import เข้า Client Component (มี `server-only` กันแล้ว แต่ระวังส่ง data ที่ไม่ได้กรอง hotel_id กลับไป)
- **การเทสต์ RLS**: ทดสอบด้วย user จริง 2 คน 2 hotel เสมอ — เคสต้องผ่าน: (ก) member เห็นเฉพาะ hotel ตัวเอง (ข) non-member เห็น 0 แถว ไม่ error (ค) superadmin เห็นหมด
- ตารางลูกที่ไม่มี `hotel_id` ตรง (เช่น `booking_rooms`) → policy ใช้ `EXISTS` subquery ขึ้นไปหา parent หรือ**ใส่ `hotel_id` ซ้ำซ้อนไปเลย** (แนะนำแบบหลัง — query report ง่ายกว่า และตรงกับ BLUEPRINT)
- **ทุก policy ใหม่ อย่าลืม `or public.is_super_admin()`** ใน `using` — ไม่งั้นหน้า super-admin จะเห็นข้อมูลไม่ครบแบบเงียบๆ (ไม่ error)

---

## 4. Booking Core (Phase 1) — ส่วนที่พลาดง่ายที่สุดของทั้งระบบ

### 4.1 การจอง/ตัด inventory → ทำเป็น Postgres function (RPC) เท่านั้น
ห้าม logic จอง = หลาย query จาก Next.js (แข่งกันได้ระหว่าง check ↔ insert) ให้เขียนเป็น DB function เดียว:

```sql
-- โครง create_booking (Phase 1 เขียนเต็ม)
create function create_booking(...) returns uuid
language plpgsql security definer as $$
begin
  -- 1) lock แถว inventory ทุกวันที่จะพัก
  perform 1 from room_type_inventory
   where room_type_id = p_room_type and date >= p_check_in and date < p_check_out
   for update;                                     -- ← FOR UPDATE สำคัญที่สุด
  -- 2) เช็ค available ทุกวัน (total - booked - blocked >= จำนวนห้องที่ขอ) ไม่พอ → raise exception
  -- 3) insert bookings + booking_rooms
  -- 4) update booked = booked + n ทุกวัน
end; $$;
```
ยกเลิก/เปลี่ยนวัน/ย้ายห้อง = function ทำนองเดียวกัน (คืนวันเก่า + ตัดวันใหม่ **ใน transaction เดียว**)

**⚠️ ข้อควรระวัง:**
- **Off-by-one คลาสสิก**: คืนที่พัก = ช่วง `[check_in, check_out)` — **ไม่รวมวัน check-out** (เข้า 1 ออก 3 = 2 คืน = ตัด inventory วันที่ 1,2 เท่านั้น) ผิดตรงนี้ = ห้องหายทั้งระบบ
- แถว `room_type_inventory` ต้อง**มีอยู่ก่อน**ถึงจะ lock ได้ → ตอนสร้าง room_type ให้ seed ล่วงหน้า ~400 วัน + cron รายวัน extend horizon (upsert idempotent)
- `hold_expires_at`: จอง pending เกินเวลา → cron คืน inventory — cron ต้อง idempotent (เช็ค `status = 'pending'` ก่อนคืน กันคืนซ้ำ)
- เปลี่ยนวัน/ยกเลิก → คำนวณส่วนต่างเงินผ่าน policy (§14 BLUEPRINT) **แสดงยอดให้พนักงานยืนยันก่อนทำจริงเสมอ** อย่าหักเงียบๆ

### 4.2 สถานะที่ห้ามข้าม
`pending → confirmed → checked_in → checked_out` (+ `cancelled`/`no_show` แตกจาก pending/confirmed)
- ทำ guard ใน function: check-in ได้เฉพาะ `confirmed`, check-out ได้เฉพาะ `checked_in` ฯลฯ — กันกดปุ่มซ้ำ/ยิง API ตรง

---

## 5. Package limits & Permission — ใช้ resolver ตัวเดียว

- สร้าง `src/lib/package/resolve-access.ts` **ที่เดียว**: อ่าน package + override → คืน effective limits/flags — ทุกจุด (page guard, เมนู, ปุ่ม, cron, server action) เรียกตัวนี้ **ห้ามเขียน COALESCE ซ้ำที่อื่น** (ไม่งั้นเมนูโชว์แต่หน้า block = UX พัง)
- Permission ฝั่ง app: `requirePermission(hotelId, 'bookings.cancel')` → เรียก RPC `user_can()` (DB เป็น source of truth ตัวจริง) — cache ต่อ request ได้ แต่**ห้าม cache ข้าม request** (สิทธิ์เพิ่งถูกแก้ต้องมีผลทันที)
- **UI matrix (§15.4)**: หน้า simple = toggle กลุ่ม → 1 toggle เขียนหลาย permission row; ตอนอ่านสถานะ toggle: ถ้า key ในกลุ่ม**ไม่ตรงกันหมด** (บางอันเปิดบางอันปิดจาก advanced) ให้แสดงสถานะ "ผสม" (indeterminate) อย่าเดาเป็นเปิด

---

## 6. เงิน / Folio / ภาษี (Phase 1)

- `folio_items` เก็บ **snapshot VAT/SC เป็น satang ณ ตอน post** — เปลี่ยน % ทีหลังห้ามกระทบรายการเก่า (ห้ามคำนวณสดตอนแสดงผล)
- โหมด `tax_inclusive`: ราคาที่ตั้ง 1,070 รวม VAT → แตกยอด backward (1,000 + 70) | exclusive: 1,000 → +70 ตอนคิดเงิน — **เลือกที่ระดับ property และแสดงชัดใน UI ตั้งราคา** ไม่งั้นโรงแรมตั้งราคาผิดทั้งระบบ
- ปัดเศษ: คำนวณเป็น satang แล้วปัดที่**บรรทัดรายการ** (ไม่ใช่ยอดรวม) — แล้วยอดรวม = ผลบวกของบรรทัด → ใบกำกับภาษีตรงเสมอ
- `payments.direction='refund'` ต้องมี `reference_payment_id` ชี้ก้อนที่คืน + ยอดคืนรวมห้ามเกินก้อนนั้น (เช็คใน function)
- แสดงผล: หาร 100 ตอน render เท่านั้น (`formatMoney(satang, currency)` helper เดียว)

---

## 7. Night Audit (Phase 2) — timezone คือตัวโกง

- `business_date` ของ property = `(now() at time zone property.timezone - cutoff)::date` — **ห้ามใช้ `current_date` ตรงๆ** (เป็น UTC จะเหลื่อมช่วงหลังเที่ยงคืน-cutoff)
- cron รันรายชั่วโมง → เช็คแต่ละ property ว่าถึง cutoff ของตัวเองหรือยัง + ยังไม่ปิดวันนั้น → ปิด (idempotent ด้วย `unique(property_id, business_date)`)
- ปิดแล้ว **ล็อก** — แก้รายการย้อนหลังใน business day ที่ปิดแล้วต้องมีสิทธิ์พิเศษ + ลง audit_logs เสมอ

---

## 8. Housekeeping ถ่ายรูปสด (Phase 2) — ขีดจำกัดของเว็บ

- ใช้ `<input type="file" accept="image/*" capture="environment">` → มือถือส่วนใหญ่เปิดกล้องตรง **แต่ web ห้าม gallery 100% ไม่ได้** (บาง browser ยังให้เลือกไฟล์ได้)
- ชั้นตรวจเพิ่ม: เช็ค EXIF `DateTimeOriginal` ใกล้เวลา upload (±5 นาที) + เก็บ `captured_at` ฝั่ง client + GPS — ต่างกันมาก = flag ให้หัวหน้าตรวจ (อย่า block อัตโนมัติ — EXIF บางเครื่องไม่มี)
- GPS ต้องขอ permission — ถ้าแม่บ้านไม่ให้ ให้บันทึกงานได้แต่ mark "ไม่มีพิกัด" (อย่าบังคับจนใช้งานไม่ได้)
- รูปอัปขึ้น `housekeeping-photos` (private bucket) ทันทีตอนถ่าย — อย่ารอกด "เสร็จ" (เน็ตหลุด = รูปหาย)

---

## 9. Storage Buckets — ตั้งค่าครั้งเดียวให้ถูก

| Bucket | Public | Policy |
|--------|--------|--------|
| `room-photos` | ✅ | เขียน: `rooms.edit` ของ hotel นั้น |
| `payment-slips` | ❌ signed URL | อ่าน: member hotel นั้น |
| `guest-ids` | ❌ signed URL | อ่าน: `user_can(hotel_id,'guests.view_id')` เท่านั้น |
| `housekeeping-photos` | ❌ signed URL | เขียน: role housekeeping / อ่าน: member |

- **path convention**: `{hotel_id}/{entity_id}/{filename}` เสมอ → เขียน Storage RLS policy อิง path segment แรกเทียบ membership ได้
- signed URL ตั้งอายุสั้น (~1 ชม.) — อย่าเก็บ signed URL ลง DB (หมดอายุ) เก็บ path แล้ว sign ตอน render

---

## 10. i18n / อีเมล

- เพิ่ม key ต้องเพิ่ม**ทั้ง `th.json` และ `en.json`** ทุกครั้ง — key หายฝั่งเดียว = runtime error (`MISSING_MESSAGE`)
- อีเมล (Resend): template 2 ภาษาตาม `guests.locale`/ภาษาที่จองเข้ามา ไม่ใช่ locale ของพนักงาน
- ส่งอีเมลจาก server action/cron เท่านั้น + ห่อ try/catch — **อีเมลล้มห้ามทำให้การจองล้ม** (จองสำเร็จก่อน แจ้งเตือนเป็น best-effort + retry queue Phase หลัง)

---

## 11.5 SaaS Billing — อัพเกรด/ดาวน์เกรด (ทำแล้ว — migration 000007 + settings/package)

**สถาปัตยกรรม (ยึดตามนี้ ห้ามเบี่ยง):**
- `hotels.package_id` = source of truth ของ entitlements — เปลี่ยนผ่าน RPC `apply_package_change()` **เท่านั้น** (atomic + เขียน audit log `package.changed` ในตัว)
- `subscriptions` (1 ต่อ hotel, Free ไม่มี row) / `invoices` (1 ต่อการเรียกเก็บ, referenceId ที่ส่ง Beam = invoices.id)
- **เขียน billing = service-role เท่านั้น** (RLS ไม่มี authenticated write โดยตั้งใจ) — server action ต้องเช็ค `isOwner()` ก่อนแตะ admin client เสมอ
- flow อัพเกรด: invoice(pending) → จ่าย → `settleInvoicePaid()` (idempotent) → ต่ออายุ subscription + apply package · **MVP ไม่ทำ proration** — รอบใหม่นับจากวันจ่าย
- flow ดาวน์เกรด: `check_package_fits()` เช็ค usage ก่อน → นัดใน `scheduled_package_id` → cron apply ตอนจบรอบ (ไม่คืนเงิน) · ยกเลิกนัดได้
- cron `/api/cron/billing`: หมดรอบ→grace (7 วัน) → เกิน grace → downgrade Free + log ทุก transition

**⚠️ ข้อควรระวัง:**
- `settleInvoicePaid` อยู่ใน `src/lib/billing/settle.ts` (**server-only**) — **ห้ามย้ายเข้าไฟล์ `"use server"`** ไม่งั้นกลายเป็น endpoint ที่ client ยิงได้โดยไม่มี auth = ใครก็ mark จ่ายแล้วได้ (เคยเกือบพลาดแล้ว — ดู bugs.md)
- webhook Beam: `verifyWebhookSignature` ตอนนี้ **return false เสมอ** (ยังไม่มี secret) — ต้อง implement HMAC จริงก่อนเปิดใช้ ห้าม return true มั่วๆ
- dev mode (ไม่มี `BEAM_API_KEY`): อัพเกรด = จ่ายผ่านทันที — **อย่าลืมว่า production ต้องมี Beam env ครบ** ไม่งั้นลูกค้าได้ของฟรี
- `check_package_fits()` ตอนนี้เช็คแค่ team members — **Phase 1 ต้องเพิ่ม properties/rooms/OTA count** (มี TODO ใน SQL)
- cron ต้องมี `CRON_SECRET` — อย่า deploy โดยไม่ตั้ง (endpoint จะ 401 ทุกครั้ง = ไม่มีใคร downgrade ได้เลย)
- ดาวน์เกรด paid→paid: ตอนจบรอบจะเข้า grace รอจ่ายแพ็กใหม่ — ถ้าไม่จ่ายใน 7 วันตกไป Free (ตั้งใจ — บีบให้จ่าย)

## 11.6 Audit Log — ใช้ทั้งระบบ

- ตาราง `audit_logs` + RPC `log_audit(hotel_id, action, entity_type, entity_id, old, new, note)` (SECURITY DEFINER — เขียนได้จากทุก context, `actor_id` = auth.uid() อัตโนมัติ, cron/webhook = null)
- **convention ชื่อ action**: `entity.verb` เช่น `package.changed`, `invoice.paid`, `downgrade.scheduled`, `booking.cancelled` — ตามนี้เสมอเพื่อ filter ได้
- อ่านได้: owner/admin ของ hotel + superadmin เท่านั้น
- **Phase 1 เป็นต้นไป: ทุก action สำคัญต้อง log** — แก้/ยกเลิก booking, refund, void folio, แก้ราคา, เปลี่ยน permission/สมาชิก (ตาม BLUEPRINT §21.9)

---

## 11. ลำดับงานแนะนำ (Phase 0 ที่เหลือ → Phase 1)

1. ต่อ Supabase จริง (§2) → regen types → เทสต์ flow: login → สร้าง hotel → dashboard
2. หน้า `settings/team` + invite UI (link ครั้งเดียว — RPC `accept_invite` มีแล้ว) + หน้า `/invite/[token]`
3. หน้า `settings/roles` (permission matrix — simple ก่อน, advanced ทีหลัง)
4. super-admin: hotels list + packages CRUD + overrides
5. Phase 1 เริ่มที่ **migrations: properties → room_types/rooms → inventory+rate_prices → bookings/payments/folios + RPC `create_booking`** (ทำ DB ให้จบก่อนแตะ UI)
6. UI ตามลำดับใช้จริง: ตั้งค่าสาขา/ห้อง/ราคา → ปฏิทิน → สร้างการจอง → front desk → folio/จ่ายเงิน

**ก่อน merge ทุกครั้ง:** `pnpm build` ต้องผ่าน + เทสต์ RLS 2-user (§3) + จดกับดักใหม่ลง `memo/bugs.md`
