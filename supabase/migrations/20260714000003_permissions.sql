-- ============================================================================
-- Permission system (BLUEPRINT §15) — fixed role preset + ติ๊กสิทธิ์ได้
-- permission keys ราย module.action · effective = COALESCE(override, preset_default)
-- ============================================================================

-- preset default ต่อ role (built-in) — เก็บในตาราง เพื่อให้ resolver + UI matrix อ่านที่เดียว
create table public.role_permission_presets (
  role hotel_role not null,
  permission text not null,
  allowed boolean not null,
  primary key (role, permission)
);

-- override รายโรงแรม (ติ๊กในหน้า matrix) — ไม่มี row = ใช้ preset
create table public.role_permissions (
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  role hotel_role not null,
  permission text not null,
  allowed boolean not null,
  primary key (hotel_id, role, permission)
);
alter table public.role_permissions enable row level security;
-- preset เป็น global reference (อ่านได้ทุกคน login) — RLS แบบอ่านอย่างเดียว
alter table public.role_permission_presets enable row level security;

-- ---------- seed preset defaults ----------
-- owner ไม่ต้อง seed (สิทธิ์เต็มเสมอ ล็อกใน resolver)
insert into public.role_permission_presets (role, permission, allowed) values
  -- admin: จัดการเกือบทุกอย่าง
  ('admin','bookings.view',true),('admin','bookings.create',true),('admin','bookings.edit',true),
  ('admin','bookings.change_date',true),('admin','bookings.move_room',true),('admin','bookings.cancel',true),
  ('admin','bookings.checkin',true),('admin','bookings.checkout',true),
  ('admin','payments.view',true),('admin','payments.charge',true),('admin','payments.refund',true),
  ('admin','payments.verify_slip',true),
  ('admin','folio.view',true),('admin','folio.add_charge',true),('admin','folio.void_charge',true),
  ('admin','rooms.view',true),('admin','rooms.edit',true),('admin','rates.view',true),('admin','rates.edit',true),
  ('admin','guests.view',true),('admin','guests.edit',true),('admin','guests.view_id',true),
  ('admin','housekeeping.view',true),('admin','housekeeping.update',true),('admin','housekeeping.assign',true),
  ('admin','reports.view',true),('admin','reports.night_audit',true),
  ('admin','channels.view',true),('admin','channels.manage',true),
  ('admin','settings.team',true),('admin','settings.properties',true),('admin','settings.package',true),
  -- manager: จัดการปฏิบัติการ (ไม่มี billing/package)
  ('manager','bookings.view',true),('manager','bookings.create',true),('manager','bookings.edit',true),
  ('manager','bookings.change_date',true),('manager','bookings.move_room',true),('manager','bookings.cancel',true),
  ('manager','bookings.checkin',true),('manager','bookings.checkout',true),
  ('manager','payments.view',true),('manager','payments.charge',true),('manager','payments.refund',true),
  ('manager','payments.verify_slip',true),
  ('manager','folio.view',true),('manager','folio.add_charge',true),('manager','folio.void_charge',true),
  ('manager','rooms.view',true),('manager','rooms.edit',true),('manager','rates.view',true),('manager','rates.edit',true),
  ('manager','guests.view',true),('manager','guests.edit',true),('manager','guests.view_id',true),
  ('manager','housekeeping.view',true),('manager','housekeeping.update',true),('manager','housekeeping.assign',true),
  ('manager','reports.view',true),('manager','reports.night_audit',true),
  ('manager','channels.view',true),
  -- front_desk: จอง/เช็คอิน/รับเงิน (ปิด cancel/refund โดย default)
  ('front_desk','bookings.view',true),('front_desk','bookings.create',true),('front_desk','bookings.edit',true),
  ('front_desk','bookings.change_date',true),('front_desk','bookings.move_room',true),('front_desk','bookings.cancel',false),
  ('front_desk','bookings.checkin',true),('front_desk','bookings.checkout',true),
  ('front_desk','payments.view',true),('front_desk','payments.charge',true),('front_desk','payments.refund',false),
  ('front_desk','payments.verify_slip',true),
  ('front_desk','folio.view',true),('front_desk','folio.add_charge',true),('front_desk','folio.void_charge',false),
  ('front_desk','rooms.view',true),('front_desk','rates.view',true),
  ('front_desk','guests.view',true),('front_desk','guests.edit',true),('front_desk','guests.view_id',true),
  ('front_desk','housekeeping.view',true),
  ('front_desk','reports.view',false),
  -- housekeeping: หน้าแม่บ้านเท่านั้น
  ('housekeeping','housekeeping.view',true),('housekeeping','housekeeping.update',true),
  ('housekeeping','rooms.view',true),
  -- viewer: อ่านอย่างเดียว
  ('viewer','bookings.view',true),('viewer','payments.view',true),('viewer','folio.view',true),
  ('viewer','rooms.view',true),('viewer','rates.view',true),('viewer','guests.view',true),
  ('viewer','housekeeping.view',true),('viewer','reports.view',true),('viewer','channels.view',true);
