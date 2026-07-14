-- ============================================================================
-- Rate model แยก inventory / price (BLUEPRINT §21.6 + NOTES §4) — หัวใจของระบบ
--   room_type_inventory (room_type_id, date) → total/booked/blocked — ห้องว่าง
--   rate_prices (rate_plan_id, room_type_id, date) → ราคา/min_stay/closed — ราคา
-- inventory เขียนผ่าน function เท่านั้น (no authenticated write) — กัน logic หลุด transaction
-- ============================================================================

-- ── rate_plans (Flexible / Non-refundable / รวมอาหาร) ───────────────────────
create table public.rate_plans (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  name text not null,
  description text,
  -- นโยบายมัดจำ (§14.3): {type: 'none'|'first_night'|'percent'|'full'|'fixed', value: n}
  deposit_policy jsonb not null default '{"type":"none"}'::jsonb,
  -- นโยบายยกเลิก (§14.4): {type:'free_until'|'non_refundable'|'tiered', ...}
  cancellation_policy jsonb not null default '{"type":"free_until","days_before":1}'::jsonb,
  include_breakfast boolean not null default false,
  is_active boolean not null default true,
  sort_order int not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index rate_plans_property_idx on public.rate_plans (property_id) where deleted_at is null;
create index rate_plans_hotel_idx on public.rate_plans (hotel_id);

-- ── rate_prices (ราคาต่อวันต่อ rate_plan × room_type) ───────────────────────
create table public.rate_prices (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  rate_plan_id uuid not null references public.rate_plans(id) on delete cascade,
  room_type_id uuid not null references public.room_types(id) on delete cascade,
  date date not null,
  price_satang bigint not null check (price_satang >= 0),
  currency char(3) not null default 'THB',
  min_stay int not null default 1 check (min_stay >= 1),
  closed boolean not null default false,      -- ปิดขายวันนี้ (stop sell)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rate_prices_unique unique (rate_plan_id, room_type_id, date)
);
create index rate_prices_lookup_idx on public.rate_prices (room_type_id, date);

-- ── room_type_inventory (ห้องว่าง — กันชน overbooking ชั้นสุดท้าย) ───────────
create table public.room_type_inventory (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  room_type_id uuid not null references public.room_types(id) on delete cascade,
  date date not null,
  total int not null default 0 check (total >= 0),
  booked int not null default 0 check (booked >= 0),
  blocked int not null default 0 check (blocked >= 0),
  updated_at timestamptz not null default now(),
  constraint inventory_unique unique (room_type_id, date),
  -- ★ constraint กันชน overbooking: จอง+ปิด ห้ามเกินห้องที่มี ★
  constraint inventory_no_overbook check (booked + blocked <= total)
);
create index inventory_lookup_idx on public.room_type_inventory (room_type_id, date);

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.rate_plans enable row level security;
alter table public.rate_prices enable row level security;
alter table public.room_type_inventory enable row level security;

create policy rate_plans_select on public.rate_plans for select to authenticated
  using (public.user_role_in_hotel(hotel_id) is not null or public.is_super_admin());
create policy rate_plans_write on public.rate_plans for all to authenticated
  using (public.user_can(hotel_id, 'rates.edit') or public.is_super_admin())
  with check (public.user_can(hotel_id, 'rates.edit') or public.is_super_admin());

create policy rate_prices_select on public.rate_prices for select to authenticated
  using (public.user_role_in_hotel(hotel_id) is not null or public.is_super_admin());
create policy rate_prices_write on public.rate_prices for all to authenticated
  using (public.user_can(hotel_id, 'rates.edit') or public.is_super_admin())
  with check (public.user_can(hotel_id, 'rates.edit') or public.is_super_admin());

-- inventory: อ่านได้ (สมาชิก) · เขียน = ผ่าน function (security definer) เท่านั้น
-- ไม่มี write policy สำหรับ authenticated โดยตั้งใจ
create policy inventory_select on public.room_type_inventory for select to authenticated
  using (public.user_role_in_hotel(hotel_id) is not null or public.is_super_admin());

-- ============================================================================
-- ensure_inventory(room_type_id, until) — upsert แถว inventory ถึงวันที่กำหนด
--   total = จำนวน rooms active ของ type · idempotent (upsert)
--   ⚠️ ไม่แตะ booked/blocked ของแถวเดิม · ไม่แตะวันที่ผ่านแล้ว
--   เรียกตอน: (ก) สร้าง/แก้ rooms  (ข) cron รายวัน extend horizon
-- ============================================================================
create or replace function public.ensure_inventory(p_room_type_id uuid, p_until date)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_hotel_id uuid;
  v_property_id uuid;
  v_total int;
  v_start date := greatest(current_date, (
    -- เริ่มจากวันถัดจากแถวสุดท้ายที่มี (กัน gap) หรือ current_date
    coalesce((select max(date) + 1 from public.room_type_inventory
              where room_type_id = p_room_type_id), current_date)
  ));
begin
  select hotel_id, property_id into v_hotel_id, v_property_id
    from public.room_types where id = p_room_type_id;
  if not found then return; end if;

  -- จำนวนห้อง active ปัจจุบันของ type นี้
  select count(*) into v_total
    from public.rooms
   where room_type_id = p_room_type_id and is_active and deleted_at is null;

  -- seed แถวใหม่สำหรับวันที่ยังไม่มี (ไม่แตะแถวเดิม → ไม่ทับ booked/blocked)
  insert into public.room_type_inventory (hotel_id, property_id, room_type_id, date, total)
  select v_hotel_id, v_property_id, p_room_type_id, d::date, v_total
    from generate_series(v_start, p_until, interval '1 day') as d
  on conflict (room_type_id, date) do nothing;
end;
$$;

-- ============================================================================
-- recalc_inventory_total(room_type_id) — sync total ของวันอนาคตกับจำนวน rooms
--   ⚠️ ห้ามแตะวันที่ผ่านแล้ว (date >= current_date เท่านั้น)
--   ถ้าลดห้องแล้ว booked+blocked > total ใหม่ → constraint จะ raise = กันลบห้องที่มีแขก
-- ============================================================================
create or replace function public.recalc_inventory_total(p_room_type_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_total int;
begin
  select count(*) into v_total
    from public.rooms
   where room_type_id = p_room_type_id and is_active and deleted_at is null;

  update public.room_type_inventory
     set total = v_total, updated_at = now()
   where room_type_id = p_room_type_id and date >= current_date;
end;
$$;

-- trigger บน rooms: insert/update/delete → recalc total + seed horizon
create or replace function public.rooms_sync_inventory()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_type uuid;
begin
  -- ครอบคลุมทั้งของเก่า/ใหม่ (กรณี update ย้าย type)
  v_type := coalesce(new.room_type_id, old.room_type_id);
  perform public.ensure_inventory(v_type, current_date + 400);
  perform public.recalc_inventory_total(v_type);
  if tg_op = 'UPDATE' and new.room_type_id is distinct from old.room_type_id then
    perform public.ensure_inventory(old.room_type_id, current_date + 400);
    perform public.recalc_inventory_total(old.room_type_id);
  end if;
  return coalesce(new, old);
end;
$$;

create trigger rooms_inventory_sync
  after insert or update or delete on public.rooms
  for each row execute function public.rooms_sync_inventory();

-- ============================================================================
-- room_blocks → บวก/ลบ blocked ในช่วงวัน (ใน transaction เดียวกับ insert/delete)
--   ถ้า booked+blocked > total → constraint raise = มีแขกอยู่ ห้ามปิดซ่อม
--   ★ ensure_inventory ก่อน กันเคสปิดวันที่ยังไม่ได้ seed แถว
-- ============================================================================
create or replace function public.room_blocks_apply()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_type uuid;
begin
  if tg_op in ('INSERT', 'UPDATE') then
    select room_type_id into v_type from public.rooms where id = new.room_id;
    perform public.ensure_inventory(v_type, new.end_date);
    update public.room_type_inventory
       set blocked = blocked + 1, updated_at = now()
     where room_type_id = v_type
       and date >= new.start_date and date < new.end_date;  -- exclusive end
  end if;
  if tg_op in ('DELETE', 'UPDATE') then
    select room_type_id into v_type from public.rooms where id = old.room_id;
    update public.room_type_inventory
       set blocked = greatest(blocked - 1, 0), updated_at = now()
     where room_type_id = v_type
       and date >= old.start_date and date < old.end_date;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger room_blocks_inventory
  after insert or update or delete on public.room_blocks
  for each row execute function public.room_blocks_apply();
