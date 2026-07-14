-- ============================================================================
-- Guests (ทะเบียนแขก + PDPA §20.1)
-- id_number / id_photo_path = ข้อมูลอ่อนไหว → อ่านผ่าน guests_safe view (ไม่มีคอลัมน์ id)
-- หน้าที่ต้องการ id จริง query ตรง + เช็ค user_can('guests.view_id')
-- (storage buckets guest-ids/payment-slips/etc สร้างตอนเชื่อม Supabase จริง — B4 ส่วน storage)
-- ============================================================================

create type guest_id_type as enum ('national_id', 'passport');

create table public.guests (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  full_name text not null,
  phone text,
  email text,
  nationality char(2),                 -- ISO 3166-1 alpha-2
  locale text,
  dob date,
  id_type guest_id_type,
  id_number text,                      -- ★ อ่อนไหว (PDPA)
  id_photo_path text,                  -- ★ อ่อนไหว — storage path (guest-ids bucket)
  pdpa_consent_at timestamptz,
  pdpa_consent_by uuid references public.profiles(id),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index guests_hotel_phone_idx on public.guests (hotel_id, phone);
create index guests_hotel_email_idx on public.guests (hotel_id, email);

alter table public.guests enable row level security;

-- select = guests.view · write = guests.edit · view_id คุมคอลัมน์อ่อนไหวที่ app layer
create policy guests_select on public.guests for select to authenticated
  using (public.user_can(hotel_id, 'guests.view') or public.is_super_admin());
create policy guests_write on public.guests for all to authenticated
  using (public.user_can(hotel_id, 'guests.edit') or public.is_super_admin())
  with check (public.user_can(hotel_id, 'guests.edit') or public.is_super_admin());

-- view ปลอดภัย (ไม่มี id_number / id_photo_path) — หน้าทั่วไป query ตัวนี้
create or replace view public.guests_safe
with (security_invoker = true) as
select id, hotel_id, full_name, phone, email, nationality, locale, dob,
       id_type, pdpa_consent_at, note, created_at, updated_at
from public.guests;
