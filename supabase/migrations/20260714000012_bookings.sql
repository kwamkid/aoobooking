-- ============================================================================
-- Bookings + booking_rooms + folios + folio_items + payments (BLUEPRINT §14 + §17)
-- ★ write ทุกตาราง = ผ่าน RPC เท่านั้น (no authenticated direct write)
--   กัน logic (ตัด inventory / คำนวณเงิน) หลุด transaction — RPC อยู่ migration 000013
-- ============================================================================

-- ── enums ───────────────────────────────────────────────────────────────────
create type booking_status as enum (
  'pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show'
);

create type payment_method as enum (
  'cash', 'bank_transfer', 'card_terminal', 'promptpay_qr', 'card_online',
  'wechat_pay', 'alipay', 'ota_collect', 'other'
);

create type booking_channel as enum (
  'front_desk', 'phone', 'walk_in', 'booking_engine',
  'ota_agoda', 'ota_booking', 'ota_trip', 'ota_other'
);

-- ── code generator (สั้น อ่านง่าย เช่น BK-7Q3ZP2) ───────────────────────────
-- ใช้ base32 ตัวอักษรไม่กำกวม (ไม่มี 0/O/1/I) — ชน retry ผ่าน unique constraint ใน RPC
create or replace function public.gen_booking_code()
returns text
language sql volatile
as $$
  select 'BK-' || string_agg(
    substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ',
           (floor(random() * 32) + 1)::int, 1), '')
  from generate_series(1, 6);
$$;

-- ── bookings ─────────────────────────────────────────────────────────────────
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete restrict,
  code text not null unique default public.gen_booking_code(),
  guest_id uuid references public.guests(id) on delete set null,   -- guests อยู่ migration 000011
  channel booking_channel not null default 'front_desk',
  status booking_status not null default 'pending',
  check_in date not null,
  check_out date not null,
  adults int not null default 1 check (adults >= 1),
  children int not null default 0 check (children >= 0),
  currency char(3) not null default 'THB',
  fx_rate_to_base numeric(18,8) not null default 1,   -- freeze FX ตอนจอง (§multi-currency)
  total_satang bigint not null default 0 check (total_satang >= 0),
  deposit_due_satang bigint not null default 0 check (deposit_due_satang >= 0),
  hold_expires_at timestamptz,                        -- pending เกินนี้ → cron คืน inventory (§21.2)
  cancelled_at timestamptz,
  cancel_reason text,
  no_show_at timestamptz,
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bookings_dates check (check_out > check_in)
);
create index bookings_hotel_idx on public.bookings (hotel_id, check_in);
create index bookings_property_idx on public.bookings (property_id, status);
create index bookings_status_hold_idx on public.bookings (status, hold_expires_at)
  where status = 'pending';
create index bookings_guest_idx on public.bookings (guest_id);

-- ── booking_rooms (segment — รองรับ mid-stay move §14.9) ────────────────────
create table public.booking_rooms (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete restrict,
  room_type_id uuid not null references public.room_types(id) on delete restrict,
  rate_plan_id uuid not null references public.rate_plans(id) on delete restrict,
  room_id uuid references public.rooms(id) on delete set null,  -- assign ตอน check-in
  start_date date not null,
  end_date date not null,
  price_per_night_satang bigint not null check (price_per_night_satang >= 0),
  nights int not null check (nights >= 1),
  created_at timestamptz not null default now(),
  constraint booking_rooms_dates check (end_date > start_date)
);
create index booking_rooms_booking_idx on public.booking_rooms (booking_id);
create index booking_rooms_room_idx on public.booking_rooms (room_id);
create index booking_rooms_hotel_idx on public.booking_rooms (hotel_id);

-- ── folios (1 ต่อ booking — บัญชีค่าใช้จ่าย §17.1) ───────────────────────────
create table public.folios (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  currency char(3) not null default 'THB',
  created_at timestamptz not null default now()
);
create index folios_hotel_idx on public.folios (hotel_id);

create type folio_item_category as enum (
  'room', 'food', 'minibar', 'laundry', 'spa', 'service_charge', 'vat', 'other'
);

-- folio_items เก็บ snapshot VAT/SC ณ ตอน post (§21.1 — เปลี่ยน % ทีหลังไม่กระทบย้อนหลัง)
create table public.folio_items (
  id uuid primary key default gen_random_uuid(),
  folio_id uuid not null references public.folios(id) on delete cascade,
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  category folio_item_category not null default 'other',
  description text not null,
  qty int not null default 1 check (qty >= 1),
  unit_price_satang bigint not null,
  amount_satang bigint not null,               -- qty * unit_price (pre-tax หรือ tax-in ตาม property)
  vat_satang bigint not null default 0,        -- snapshot
  service_charge_satang bigint not null default 0,  -- snapshot
  voided_at timestamptz,                       -- void = เพิ่ม flag (ห้ามลบ row §17)
  voided_by uuid references public.profiles(id),
  void_reason text,
  posted_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index folio_items_folio_idx on public.folio_items (folio_id) where voided_at is null;
create index folio_items_hotel_idx on public.folio_items (hotel_id);

-- ── payments (ledger §14.6 — ห้ามแก้/ลบ, refund = row ใหม่) ──────────────────
create type payment_direction as enum ('charge', 'refund');
create type payment_status as enum ('pending', 'confirmed', 'failed', 'voided');

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  direction payment_direction not null default 'charge',
  amount_satang bigint not null check (amount_satang >= 0),
  currency char(3) not null default 'THB',
  fx_rate_to_base numeric(18,8) not null default 1,
  amount_base_satang bigint not null,          -- amount * fx (freeze) — ยอดในรายงาน
  method payment_method not null,
  status payment_status not null default 'pending',
  slip_path text,                              -- storage path (payment-slips bucket)
  gateway_ref text,
  reference_payment_id uuid references public.payments(id),  -- refund ชี้ charge ที่คืน
  note text,
  received_by uuid references public.profiles(id),
  confirmed_at timestamptz,
  confirmed_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index payments_booking_idx on public.payments (booking_id);
create index payments_hotel_idx on public.payments (hotel_id, created_at desc);
create index payments_ref_idx on public.payments (reference_payment_id);

-- ── RLS: select = member · write = ผ่าน RPC (security definer) เท่านั้น ──────
-- ไม่มี write policy สำหรับ authenticated ทุกตาราง (โดยตั้งใจ — กัน direct write)
alter table public.bookings enable row level security;
alter table public.booking_rooms enable row level security;
alter table public.folios enable row level security;
alter table public.folio_items enable row level security;
alter table public.payments enable row level security;

create policy bookings_select on public.bookings for select to authenticated
  using (public.user_role_in_hotel(hotel_id) is not null or public.is_super_admin());
create policy booking_rooms_select on public.booking_rooms for select to authenticated
  using (public.user_role_in_hotel(hotel_id) is not null or public.is_super_admin());
create policy folios_select on public.folios for select to authenticated
  using (public.user_role_in_hotel(hotel_id) is not null or public.is_super_admin());
create policy folio_items_select on public.folio_items for select to authenticated
  using (public.user_role_in_hotel(hotel_id) is not null or public.is_super_admin());
create policy payments_select on public.payments for select to authenticated
  using (public.user_role_in_hotel(hotel_id) is not null or public.is_super_admin());

-- ── view: folio balance realtime (จ่ายแล้ว/ค้าง) ────────────────────────────
-- paid = sum(charge.confirmed) - sum(refund.confirmed)
create or replace view public.booking_balances
with (security_invoker = true) as
select
  b.id as booking_id,
  b.hotel_id,
  b.total_satang,
  coalesce(fi.charges_satang, 0) as folio_charges_satang,
  coalesce(pm.paid_satang, 0) as paid_satang,
  b.total_satang - coalesce(pm.paid_satang, 0) as balance_satang
from public.bookings b
left join (
  select folio_id, sum(amount_satang + vat_satang + service_charge_satang) as charges_satang
  from public.folio_items where voided_at is null group by folio_id
) fi on fi.folio_id = (select id from public.folios where booking_id = b.id)
left join (
  select booking_id,
    sum(case when direction = 'charge' then amount_satang else -amount_satang end)
      filter (where status = 'confirmed') as paid_satang
  from public.payments group by booking_id
) pm on pm.booking_id = b.id;
