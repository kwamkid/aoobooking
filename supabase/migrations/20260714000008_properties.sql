-- ============================================================================
-- Properties (สาขา) — ระดับที่ 2 ของ tenant (hotels → properties)
-- BLUEPRINT §9 + §21.1 (ภาษี/service charge ต่อสาขา)
-- ⚠️ ทุกตารางใต้ property ต้องใส่ทั้ง hotel_id (RLS+report) และ property_id
-- ============================================================================

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  slug text not null,                                  -- unique ต่อ hotel (booking engine: /hotel/property)
  name text not null,
  address text,
  phone text,
  timezone text not null default 'Asia/Bangkok',
  default_currency char(3),                            -- null = ใช้ base_currency ของ hotel
  check_in_time time not null default '14:00',
  check_out_time time not null default '12:00',

  -- ── ภาษี + service charge (§21.1) ──
  vat_percent numeric(5,2) not null default 7,
  service_charge_percent numeric(5,2) not null default 0,
  tax_inclusive boolean not null default true,         -- true = ราคาที่ตั้งรวมภาษีแล้ว

  -- ── night audit (§16) ──
  business_day_cutoff time not null default '06:00',
  night_audit_mode text not null default 'both'
    check (night_audit_mode in ('auto', 'manual', 'both')),

  is_active boolean not null default true,
  deleted_at timestamptz,                              -- soft delete
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint properties_slug_format check (slug ~ '^[a-z0-9]([a-z0-9-]{0,48}[a-z0-9])?$'),
  constraint properties_slug_unique unique (hotel_id, slug)
);
create index properties_hotel_idx on public.properties (hotel_id) where deleted_at is null;

alter table public.properties enable row level security;

-- ── RLS triplet: member-select / capability-write / super-admin-bypass ──
create policy properties_select on public.properties for select to authenticated
  using (public.user_role_in_hotel(hotel_id) is not null or public.is_super_admin());

create policy properties_write on public.properties for all to authenticated
  using (public.user_can(hotel_id, 'settings.properties') or public.is_super_admin())
  with check (public.user_can(hotel_id, 'settings.properties') or public.is_super_admin());

-- ============================================================================
-- check_package_fits: เพิ่มนับ properties (ลบ TODO Phase 1 สำหรับ properties)
-- นับเฉพาะที่ยังไม่ถูก soft delete
-- ============================================================================
create or replace function public.check_package_fits(p_hotel_id uuid, p_package_id uuid)
returns text[]
language plpgsql stable security definer set search_path = public
as $$
declare
  v_pkg public.packages%rowtype;
  v_violations text[] := '{}';
  v_members int;
  v_properties int;
begin
  select * into v_pkg from public.packages where id = p_package_id;
  if not found then return array['package_not_found']; end if;

  select count(*) into v_members from public.hotel_members where hotel_id = p_hotel_id;
  if v_pkg.max_team_members is not null and v_members > v_pkg.max_team_members then
    v_violations := v_violations
      || format('members:%s>%s', v_members, v_pkg.max_team_members);
  end if;

  select count(*) into v_properties
    from public.properties where hotel_id = p_hotel_id and deleted_at is null;
  if v_pkg.max_properties is not null and v_properties > v_pkg.max_properties then
    v_violations := v_violations
      || format('properties:%s>%s', v_properties, v_pkg.max_properties);
  end if;

  -- TODO(Phase 1): เช็ค max_rooms (migration 000009) / max_ota_channels
  return v_violations;
end;
$$;
