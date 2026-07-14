-- ============================================================================
-- Room types + rooms + room blocks (§21.4 + §21.5)
-- room_types = สินค้าที่ขาย (ราคา/occupancy) · rooms = ห้องจริง (assign ตอน check-in)
-- room_blocks = ปิดห้อง (ซ่อม/renovate) → exclusion constraint กันช่วงซ้อน
-- ============================================================================

create extension if not exists btree_gist;   -- ต้องใช้กับ exclusion constraint ด้านล่าง

-- ── room_types (occupancy pricing §21.5) ────────────────────────────────────
create table public.room_types (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  name text not null,
  description text,

  base_occupancy int not null default 2 check (base_occupancy >= 1),
  max_occupancy int not null default 2 check (max_occupancy >= base_occupancy),
  extra_adult_satang bigint not null default 0 check (extra_adult_satang >= 0),
  extra_child_satang bigint not null default 0 check (extra_child_satang >= 0),
  child_age_limit int not null default 12 check (child_age_limit >= 0),

  amenities jsonb not null default '[]'::jsonb,
  photos jsonb not null default '[]'::jsonb,
  sort_order int not null default 0,
  is_active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index room_types_property_idx on public.room_types (property_id) where deleted_at is null;
create index room_types_hotel_idx on public.room_types (hotel_id);

-- ── rooms (ห้องจริง) ────────────────────────────────────────────────────────
create type housekeeping_status as enum ('clean', 'dirty', 'inspected', 'out_of_order');

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  room_type_id uuid not null references public.room_types(id) on delete restrict,
  room_number text not null,
  floor text,
  housekeeping_status housekeeping_status not null default 'clean',
  is_active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rooms_number_unique unique (property_id, room_number)
);
create index rooms_type_idx on public.rooms (room_type_id) where deleted_at is null;
create index rooms_property_idx on public.rooms (property_id) where deleted_at is null;
create index rooms_hotel_idx on public.rooms (hotel_id);

-- ── room_blocks (ปิดห้อง §21.4) ─────────────────────────────────────────────
create type room_block_reason as enum ('maintenance', 'renovation', 'private');

create table public.room_blocks (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  start_date date not null,
  end_date date not null,                      -- exclusive (เหมือน check_out)
  reason room_block_reason not null default 'maintenance',
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint room_blocks_dates check (end_date > start_date),
  -- กันช่วงปิดซ้อนกันในห้องเดียว (daterange exclusive)
  constraint room_blocks_no_overlap
    exclude using gist (room_id with =, daterange(start_date, end_date) with &&)
);
create index room_blocks_room_idx on public.room_blocks (room_id);
create index room_blocks_hotel_idx on public.room_blocks (hotel_id);

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.room_types enable row level security;
alter table public.rooms enable row level security;
alter table public.room_blocks enable row level security;

create policy room_types_select on public.room_types for select to authenticated
  using (public.user_role_in_hotel(hotel_id) is not null or public.is_super_admin());
create policy room_types_write on public.room_types for all to authenticated
  using (public.user_can(hotel_id, 'rooms.edit') or public.is_super_admin())
  with check (public.user_can(hotel_id, 'rooms.edit') or public.is_super_admin());

create policy rooms_select on public.rooms for select to authenticated
  using (public.user_role_in_hotel(hotel_id) is not null or public.is_super_admin());
create policy rooms_write on public.rooms for all to authenticated
  using (public.user_can(hotel_id, 'rooms.edit') or public.is_super_admin())
  with check (public.user_can(hotel_id, 'rooms.edit') or public.is_super_admin());

create policy room_blocks_select on public.room_blocks for select to authenticated
  using (public.user_role_in_hotel(hotel_id) is not null or public.is_super_admin());
create policy room_blocks_write on public.room_blocks for all to authenticated
  using (public.user_can(hotel_id, 'rooms.edit') or public.is_super_admin())
  with check (public.user_can(hotel_id, 'rooms.edit') or public.is_super_admin());

-- ============================================================================
-- check_package_fits: เพิ่มนับ rooms (รวมทุกสาขาของ hotel)
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
  v_rooms int;
begin
  select * into v_pkg from public.packages where id = p_package_id;
  if not found then return array['package_not_found']; end if;

  select count(*) into v_members from public.hotel_members where hotel_id = p_hotel_id;
  if v_pkg.max_team_members is not null and v_members > v_pkg.max_team_members then
    v_violations := v_violations || format('members:%s>%s', v_members, v_pkg.max_team_members);
  end if;

  select count(*) into v_properties
    from public.properties where hotel_id = p_hotel_id and deleted_at is null;
  if v_pkg.max_properties is not null and v_properties > v_pkg.max_properties then
    v_violations := v_violations || format('properties:%s>%s', v_properties, v_pkg.max_properties);
  end if;

  select count(*) into v_rooms
    from public.rooms where hotel_id = p_hotel_id and deleted_at is null;
  if v_pkg.max_rooms is not null and v_rooms > v_pkg.max_rooms then
    v_violations := v_violations || format('rooms:%s>%s', v_rooms, v_pkg.max_rooms);
  end if;

  -- TODO(Phase 4): เช็ค max_ota_channels ตอนทำ channel manager
  return v_violations;
end;
$$;
