---
name: dummy
description: ล้างข้อมูลจอง/เงิน/แขกของโรงแรมเทส แล้ว seed dummy data ใหม่ตามสเปกที่ผู้ใช้สั่ง (หรือชุด preset) ผ่าน RPC จริงของระบบ — ใช้เมื่อพิมพ์ /dummy <สเปก> เช่น "/dummy ชุดเต็ม", "/dummy ชุดหน้างานวันนี้", "/dummy จอง 3 ห้องค้างจ่าย + โอนรอตรวจสลิป 1 ใบ"
---

# /dummy — ล้าง + seed ข้อมูลเทสของ AooBooking

ผู้ใช้ (เจ้าของโปรเจกต์) ต้องการกดเทส UI จากข้อมูลชุดใหม่ที่รู้หน้าตาแน่นอน
workflow ตายตัวคือ: **ล้างข้อมูลเก่าของโรงแรมเทสทั้งหมดก่อนเสมอ → seed ตามสเปก
→ สรุปเป็นตารางว่าสร้างอะไรไว้เทสจุดไหน** ไม่ต้องถามยืนยันก่อนล้าง
(เจ้าของเคาะ workflow นี้เอง 2026-07-23) — แต่ถ้าผู้ใช้ระบุโรงแรมอื่นที่ไม่ใช่
โรงแรมเทส ให้หยุดถามก่อนเสมอ

## ขอบเขต + ความปลอดภัย

- **โรงแรมเทส = `abchotel` เท่านั้น** (dev DB, Supabase project `nqfejssebsnktwdpigat`)
  — resolve id สดทุกครั้ง: `select id, owner_id from hotels where slug='abchotel'`
- **ล้างเฉพาะ transactional data**: bookings / booking_rooms / payments / folios /
  folio_items / guests / tenancies / room_blocks / audit_logs (เฉพาะ entity ที่เกี่ยว)
  + reset `room_type_inventory` (booked=0, blocked=0) + reset
  `rooms.housekeeping_status='clean'`
- **ห้ามแตะ master data**: hotels / properties / room_types / rooms / rate_plans /
  rate_prices / hotel_payment_methods / hotel_payment_accounts / hotel_members
- seed ผ่าน **RPC จริงเสมอ** (create_booking / record_payment / check_in_booking /
  cancel_booking / mark_no_show / post_folio_item) สวมสิทธิ์ owner — inventory,
  folio, audit จะถูกต้องเองโดยไม่ต้อง insert มือ · แก้ตรงด้วย SQL เฉพาะจุดที่ RPC
  ทำไม่ได้ (ย้อนวันที่, ota_reference, backdate timestamp)
- จบทุกครั้ง: query สรุปกลับมาเช็ค (จำนวน booking ต่อสถานะ + inventory วันนี้±7)
  แล้วรายงานผู้ใช้เป็นตาราง: โค้ดจอง · แขก · วันที่ · สถานะ · จ่าย/ค้าง · **เอาไว้เทสอะไร**

## วิธีรัน SQL (สูตรเต็มใน memo/learning.md)

```bash
TOKEN="$(security find-generic-password -s "Supabase CLI" -w)"
DEC="$(echo "${TOKEN#go-keyring-base64:}" | base64 -d)"
api() { jq -n --arg q "$1" '{query:$q}' | curl -s -X POST \
  "https://api.supabase.com/v1/projects/nqfejssebsnktwdpigat/database/query" \
  -H "Authorization: Bearer $DEC" -H "Content-Type: application/json" -d @-; }
# สวมสิทธิ์ owner (ใส่นำหน้าใน batch เดียวกับ RPC ที่เช็ค user_can/auth.uid):
IMP="select set_config('role','authenticated',true), set_config('request.jwt.claims','{\"sub\":\"<OWNER_UUID>\",\"role\":\"authenticated\"}',true);"
```

- แต่ละ `api` call = 1 transaction · statement ที่ raise → ทั้ง batch fail
- ⚠️ `current_date` ฝั่ง DB เป็น **UTC** (ตี 7 ไทยถึงจะขึ้นวันใหม่) — "วันนี้" ของทุก
  recipe ให้ใช้ current_date ของ DB ไม่ใช่วันไทย ไม่งั้น badge เข้าวันนี้/ออกวันนี้เพี้ยน

## ขั้น 1 — Wipe (รันก่อนเสมอ)

ลำดับ FK สำคัญ (ลูกก่อนแม่ · tenancies อ้าง guests แบบ restrict):

```sql
-- ใน batch เดียว (แทน :HID ด้วย hotel id จริง)
delete from audit_logs where hotel_id=':HID' and entity_type in ('booking','payment','tenancy','guest','folio');
delete from payments where hotel_id=':HID';
delete from folio_items where folio_id in (select id from folios where hotel_id=':HID');
delete from folios where hotel_id=':HID';
delete from booking_rooms where booking_id in (select id from bookings where hotel_id=':HID');
delete from tenancies where hotel_id=':HID';
delete from room_blocks where hotel_id=':HID';
delete from bookings where hotel_id=':HID';
delete from guests where hotel_id=':HID';
update room_type_inventory set booked=0, blocked=0, updated_at=now() where hotel_id=':HID';
update rooms set housekeeping_status='clean', updated_at=now() where hotel_id=':HID';
select 'wiped' as result;
```

(สลิปใน storage bucket `payment-slips/{hotel_id}/...` ปล่อยไว้ได้ — ไม่มี FK ไม่พังอะไร)

## ขั้น 2 — Fixtures

query ทีเดียวเก็บไว้ใช้ทั้ง run: hotel id + owner_id · property id · room_types
(id, name, base/max occupancy, extra_*_satang) · rate_plans (id, name,
cancellation_policy) · จำนวนห้องจริงต่อประเภท · current_date ของ DB
ห้าม hardcode id ในสูตร — ดึงสดเสมอ

## ขั้น 3 — Recipes (ก้อนต่อยอดให้ครบทุกเคส)

ชื่อแขก dummy ใช้ชื่อไทยสมจริง (สมชาย ใจดี, วรรณา สุขสันต์, John Miller, …)
เบอร์รูปแบบ +668XXXXXXXX — ไม่ต้องใส่ prefix พิเศษ เพราะ wipe ล้างทั้งโรงแรมอยู่แล้ว

- **confirmed** (อนาคต/วันนี้): `create_booking(hotel, property, room_type,
  rate_plan, in, out, '[{"adults":2,"children":0}]', '{"full_name":"..","phone":".."}',
  'front_desk')` — front_desk = confirmed ทันที
- **pending รอยืนยัน**: create แล้ว `update bookings set status='pending' where id=..`
  (inventory ถูกตัดแล้ว — ตรงพฤติกรรม hold)
- **จองย้อนหลัง k วัน** (สำหรับ late arrival / no-show / ประวัติ): create ช่วง
  `[today, today+n)` ก่อน แล้วเลื่อนถอยใน batch เดียว:
  ```sql
  update bookings set check_in=check_in-k, check_out=check_out-k where id=..;
  update booking_rooms set start_date=start_date-k, end_date=end_date-k where booking_id=..;
  -- คืน inventory เฉพาะหางช่วงเดิมที่ไม่อยู่ในช่วงใหม่แล้ว: วันที่ [today+n-k, today+n)
  update room_type_inventory set booked=greatest(booked-<ห้อง>,0)
   where room_type_id=.. and date >= '<today+n-k>' and date < '<today+n>';
  -- แถววันก่อน today ไม่มีใน inventory = ไม่เป็นไร (อดีตขายไม่ได้อยู่แล้ว)
  ```
- **checked_in**: create (+ ย้อนวันถ้าต้องเข้าเมื่อวาน) → เลือกเบอร์ห้องว่างของ
  ประเภทนั้น (ห้อง active ที่ยังไม่ถูก booking สถานะ checked_in ตัวอื่น assign) →
  `check_in_booking(id, '[{"booking_room_id":"..","room_id":".."}]')`
  → ถ้าจำลองเช็คอินเมื่อวาน: `update bookings set checked_in_at = checked_in_at - interval '1 day'`
- **จ่ายเงิน**: `record_payment(booking, satang, 'cash')` = confirmed ทันที ·
  มัดจำบางส่วน = จ่ายน้อยกว่ายอด · **ชำระเกิน** = จ่ายเกินยอด ·
  **โอนรอตรวจสลิป** = method `'bank_transfer'` (slip_path ว่างได้ — จะไม่มีลิงก์ดูสลิป
  แต่ปุ่มยืนยัน/ปฏิเสธขึ้นครบ)
- **checked_out (ประวัติ)**: จองย้อนหลัง → จ่ายเต็ม → check_in_booking →
  check_out_booking → backdate `checked_in_at`/`checked_out_at` + ถ้าไม่อยากให้ห้อง
  ค้าง dirty ก็ reset housekeeping
- **cancelled + refund pending**: จองอนาคต (policy Flexible free_until 1 → คืนเต็ม)
  → จ่าย → `cancel_booking(id,'เหตุผล')` — ได้ refund pending อัตโนมัติไว้เทส
  "บันทึกว่าคืนเงินแล้ว" · cancelled เฉยๆ = ไม่ต้องจ่ายก่อน cancel
- **no_show**: จองย้อนหลัง (check_in เมื่อวาน) → จ่าย → `mark_no_show(id)` = ยึดเงิน ·
  หรือถ้าจะเทส **ปุ่ม** No-show ให้หยุดที่ confirmed ไม่ต้องเรียก RPC
- **late arrival (เทสกล่องถามตอนเช็คอิน)**: จองย้อนหลัง check_in เมื่อวาน
  check_out พรุ่งนี้+ สถานะ confirmed ห้ามเช็คอิน
- **หลายห้อง/เด็ก/ค่าเสริม**: p_room_guests หลาย entry เช่น
  `[{"adults":2,"children":0},{"adults":2,"children":1}]` — เด็ก/ผู้ใหญ่เกิน base จะ
  โดนค่าเสริมเองตามสูตร RPC
- **OTA**: p_channel `'ota_agoda'` แล้ว `update bookings set ota_reference='1234567890'`
- **folio รายการเสริม**: `post_folio_item(...)` — ดู signature จาก
  [actions ของหน้า detail](src/app/(app)/[hotel]/bookings/[id]/actions.ts) ก่อนเรียก ·
  รายการ voided = post แล้ว `void_folio_item`
- **ห้องเต็ม**: จองประเภทเดียวกันวนจน `available = 0` ในวันเป้าหมาย
  (เช็คจาก room_type_inventory) — แขกคนละชื่อ
- **แขกประจำ**: create_booking 2 ใบด้วยแขกชื่อ/เบอร์เดียวกัน (เช็คก่อนว่า RPC
  reuse guest ตามเบอร์ไหม — ถ้าไม่ ให้ update guest_id ใบที่สองชี้คนเดียวกัน
  แล้วลบ guest ที่เกินมา)
- **เช่ารายเดือน**: RPC สร้าง tenancy (ดู signature ใน migration
  20260717000029_monthly_tenancy.sql) — ทำเมื่อผู้ใช้ขอเทสโมดูลรายเดือนเท่านั้น

## Preset sets

ผู้ใช้บอกชื่อชุดหรือบรรยายเอง — บรรยายเอง = แปลงเป็น recipes ข้างบน

### `ชุดเต็ม` — ครอบทุกเคส (~16 bookings)
| # | เคส | เอาไว้เทส |
|---|-----|-----------|
| 1 | pending เข้าอีก 3 วัน | ปุ่มยืนยันการจอง |
| 2 | confirmed เข้าอีก 2 วัน | เลื่อนวัน/ย้ายห้อง/ยกเลิกก่อนเข้า |
| 3 | confirmed เข้าวันนี้ | เช็คอิน + เลือกเบอร์ห้อง/ชั้น + badge เข้าวันนี้ |
| 4 | checked_in เข้าเมื่อวาน–ออกพรุ่งนี้ จ่ายมัดจำครึ่งเดียว | จ่ายเพิ่ม + folio + เวลาเช็คอินจริง |
| 5 | checked_in ออกวันนี้ ค้างเต็ม | เช็คเอาท์เก็บเงินจบจังหวะเดียว + badge ออกวันนี้ |
| 6 | checked_in ชำระเกิน | คืนส่วนเกิน (refund) → เช็คเอาท์ผ่าน |
| 7 | checked_out เมื่อวาน จ่ายครบ | ประวัติ + เวลาเช็คเอาท์ + ห้อง dirty |
| 8 | cancelled ไม่เคยจ่าย | สถานะยกเลิกเฉยๆ ไม่มีเงินค้าง |
| 9 | cancelled จ่ายแล้ว → refund pending | badge รอคืนเงิน + บันทึกว่าคืนแล้ว/ตีโมฆะ |
| 10 | no_show เมื่อวาน (ยึดเงิน) | สถานะไม่มา + ยอดไม่โชว์ค้าง |
| 11 | confirmed check_in เมื่อวาน (ยังไม่เช็คอิน) | **กล่องถาม late check-in 3 ทาง** + ปุ่ม No-show |
| 12 | โอนธนาคาร รอตรวจสลิป | ยืนยัน/ปฏิเสธสลิป |
| 13 | จอง 3 ห้อง (2\|2\|2+เด็ก 1) เข้าวันนี้ | multi-room + เช็คอินหลายเบอร์ + ค่าเสริมเด็ก |
| 14 | OTA Agoda มีเลขอ้างอิง เข้าพรุ่งนี้ | เลข 2 ชั้นในตาราง + channel |
| 15 | checked_in + folio มินิบาร์ 2 รายการ (1 voided) | หน้า folio + void + ภาษี |
| 16 | พรุ่งนี้ห้องเต็ม 1 ประเภท | wizard "ไม่ว่าง/ว่างแค่ N" + จัดเป็น N ห้อง |

### ชุดย่อย
- `ชุดหน้างานวันนี้` = 3, 5, 11, 12 — เทสหน้างานวันนี้/เช็คอิน/เช็คเอาท์
- `ชุดเงิน` = 4, 5, 6, 9, 12, 15 — payment modal / checkout / refund / สลิป
- `ชุดยกเลิกคืนเงิน` = 8, 9, 10, 11 — cancel / no-show / refund ครบวง
- `ชุด wizard` = 13, 16 (+ห้องว่างปกติ) — หน้าจองใหม่ทุกทาง

## Don't

- ห้ามรันกับโรงแรมอื่นนอกจาก abchotel เว้นแต่ผู้ใช้ระบุ slug เอง (ถามย้ำ 1 ครั้ง)
- ห้าม insert bookings/payments ตรงๆ ถ้ามี RPC — ข้อมูลจะไม่ตรง flow จริง
  (inventory/folio/audit หาย) แล้วเทสจะเพี้ยน
- ห้ามแก้ master data (ห้อง/ราคา/สมาชิก) เพื่อให้ได้เคส — เช่นอยากได้ห้องเต็ม
  ให้จองจนเต็ม ไม่ใช่ลด total ใน inventory
- ห้ามลืมรายงานตารางสรุปตอนจบ — ผู้ใช้เปิด UI เทสต่อทันที ต้องรู้ว่าใบไหนเทสอะไร
