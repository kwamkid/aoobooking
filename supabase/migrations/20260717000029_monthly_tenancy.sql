-- ═══════════════════════════════════════════════════════════════════════════
-- เช่าห้องรายเดือน M1+M2 (เจ้าของเคาะ 2026-07-17)
-- - ห้องเดิมสลับรายวัน↔รายเดือนได้ (ว่างก็ปล่อยเช่าได้เลย)
-- - บิลทุกวันที่ 1 (เดือนแรก pro-rate) — ตัวบิล/มิเตอร์เป็น M3
-- - มัดจำ/ค่าน้ำ-ไฟต่อหน่วย ตั้งที่สาขา · ราคาเช่าตั้งต่อประเภทห้อง
-- - กันขายซ้ำ: tenancy → insert room_blocks (reason ใหม่ monthly_tenant)
--   → trigger เดิม recalc inventory → หน้าจองรายวันเห็นห้องหายไปเอง
-- ═══════════════════════════════════════════════════════════════════════════

-- ── M0: โมดูลเสริมตามแพ็กเกจ (เจ้าของสั่ง: เช่ารายเดือน = add-on module) ─────
-- ตาม pattern feature flag เดิม (allow_booking_engine ฯลฯ): flag ที่ package
-- + override รายโรงแรม · เช็ค 3 ชั้น: DB (helper นี้ใน RPC) + page guard + ซ่อนเมนู
alter table public.packages
  add column allow_monthly_rental boolean not null default false;
alter table public.hotel_package_overrides
  add column allow_monthly_rental_override boolean;

-- เปิดให้ตั้งแต่ Pro ขึ้นไป (superadmin แก้ได้ในหน้า packages)
update public.packages set allow_monthly_rental = true
 where slug in ('pro', 'business', 'enterprise');

create or replace function public.hotel_monthly_enabled(p_hotel_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select o.allow_monthly_rental_override
       from public.hotel_package_overrides o
      where o.hotel_id = p_hotel_id
        and (o.expires_at is null or o.expires_at > now())),
    (select p.allow_monthly_rental
       from public.hotels h join public.packages p on p.id = h.package_id
      where h.id = p_hotel_id),
    false
  );
$$;

-- ── M1: ตั้งค่า ─────────────────────────────────────────────────────────────
-- ราคาเช่า/เดือน ต่อประเภทห้อง (null = ไม่เปิดรายเดือน — field เดียวเป็นทั้ง flag+ราคา)
alter table public.room_types
  add column monthly_rent_satang bigint check (monthly_rent_satang is null or monthly_rent_satang >= 0);

-- ตั้งค่ารายเดือนของสาขา (ใช้ตอนสร้างสัญญา + ออกบิล M3)
alter table public.properties
  add column monthly_deposit_months int not null default 1 check (monthly_deposit_months >= 0),
  add column water_unit_satang bigint not null default 0 check (water_unit_satang >= 0),
  add column electric_unit_satang bigint not null default 0 check (electric_unit_satang >= 0);

-- block เหตุผลใหม่ (ค่าใหม่ถูกใช้เฉพาะ runtime หลัง commit — ปลอดภัยใน tx PG12+)
alter type room_block_reason add value if not exists 'monthly_tenant';

-- ── M2: สัญญาเช่า ───────────────────────────────────────────────────────────
create type tenancy_status as enum ('active', 'ended');

create table public.tenancies (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete restrict,
  guest_id uuid not null references public.guests(id) on delete restrict,
  start_date date not null,
  end_date date,                                -- null = อยู่ยาว (ต่ออัตโนมัติ)
  rent_satang bigint not null check (rent_satang >= 0),
  deposit_satang bigint not null default 0 check (deposit_satang >= 0),
  status tenancy_status not null default 'active',
  block_id uuid references public.room_blocks(id) on delete set null, -- block คู่สัญญา
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- ห้องหนึ่งมีผู้เช่า active ได้คนเดียว
create unique index tenancies_room_active on public.tenancies (room_id)
  where status = 'active';
create index tenancies_hotel_idx on public.tenancies (hotel_id);

alter table public.tenancies enable row level security;
create policy tenancies_select on public.tenancies for select to authenticated
  using (public.user_role_in_hotel(hotel_id) is not null or public.is_super_admin());
-- เขียน = ผ่าน RPC (security definer) เท่านั้น — ไม่มี write policy โดยตั้งใจ
-- (แบบเดียวกับ inventory: กัน state สัญญา/block หลุด sync)

-- ── สร้างสัญญา — atomic: เช็คว่าง + lock inventory + insert + block (rules #5) ──
create or replace function public.create_tenancy(
  p_hotel_id uuid,
  p_room_id uuid,
  p_start_date date,
  p_end_date date default null,                 -- null = อยู่ยาว (block ล่วงหน้า 1 ปี)
  p_rent_satang bigint default null,            -- null = ใช้ราคาประเภทห้อง
  p_deposit_satang bigint default null,         -- null = default สาขา (เดือน × ค่าเช่า)
  p_guest jsonb default '{}'::jsonb             -- {guest_id} หรือ {full_name, phone, email}
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_room record;
  v_rent bigint;
  v_deposit bigint;
  v_guest_id uuid;
  v_block_end date;
  v_block_id uuid;
  v_tenancy_id uuid;
  v_day date;
  v_available int;
begin
  if not (public.user_can(p_hotel_id, 'bookings.create') or public.is_super_admin()) then
    raise exception 'ไม่มีสิทธิ์สร้างสัญญาเช่า' using errcode = '42501';
  end if;
  if not public.hotel_monthly_enabled(p_hotel_id) then
    raise exception 'แพ็กเกจปัจจุบันไม่มีโมดูลเช่ารายเดือน — อัพเกรดแพ็กเกจก่อน';
  end if;
  if p_end_date is not null and p_end_date <= p_start_date then
    raise exception 'วันสิ้นสุดต้องหลังวันเริ่ม';
  end if;

  select r.id, r.property_id, r.room_number, r.room_type_id,
         rt.monthly_rent_satang, p.monthly_deposit_months
    into v_room
    from public.rooms r
    join public.room_types rt on rt.id = r.room_type_id
    join public.properties p on p.id = r.property_id
   where r.id = p_room_id and r.hotel_id = p_hotel_id and r.deleted_at is null;
  if v_room.id is null then raise exception 'ไม่พบห้อง'; end if;
  if v_room.monthly_rent_satang is null and p_rent_satang is null then
    raise exception 'ประเภทห้องนี้ยังไม่เปิดเช่ารายเดือน (ตั้งราคาเช่าที่ประเภทห้องก่อน)';
  end if;

  v_rent := coalesce(p_rent_satang, v_room.monthly_rent_satang);
  v_deposit := coalesce(p_deposit_satang, v_room.monthly_deposit_months * v_rent);
  -- อยู่ยาว = block ล่วงหน้า 1 ปี (M3 cron ต่อ block ให้เอง — จดไว้)
  v_block_end := coalesce(p_end_date, p_start_date + interval '1 year');

  -- มีผู้เช่า active อยู่แล้ว?
  if exists (select 1 from public.tenancies t
              where t.room_id = p_room_id and t.status = 'active') then
    raise exception 'ห้อง % มีผู้เช่าอยู่แล้ว', v_room.room_number;
  end if;

  -- lock inventory ช่วง [start, block_end) แล้วเช็คว่าง — กันชนกับจองรายวัน
  perform public.ensure_inventory(v_room.room_type_id, v_block_end);
  perform 1 from public.room_type_inventory
    where room_type_id = v_room.room_type_id
      and date >= p_start_date and date < v_block_end
    for update;

  v_day := p_start_date;
  while v_day < v_block_end loop
    select (total - booked - blocked) into v_available
      from public.room_type_inventory
     where room_type_id = v_room.room_type_id and date = v_day;
    if coalesce(v_available, 0) < 1 then
      raise exception 'ห้องไม่ว่างวันที่ % (มีจองรายวัน/ปิดห้องอยู่) — ให้เช่าไม่ได้', v_day;
    end if;
    v_day := v_day + 1;
  end loop;

  -- guest: ใช้เดิมหรือสร้างใหม่
  if p_guest ? 'guest_id' and (p_guest->>'guest_id') is not null then
    v_guest_id := (p_guest->>'guest_id')::uuid;
  else
    insert into public.guests (hotel_id, full_name, phone, email)
    values (p_hotel_id, coalesce(p_guest->>'full_name', 'ผู้เช่า'),
            p_guest->>'phone', p_guest->>'email')
    returning id into v_guest_id;
  end if;

  -- block ห้อง (trigger recalc inventory ให้เอง) แล้วผูกกับสัญญา
  insert into public.room_blocks
    (hotel_id, property_id, room_id, start_date, end_date, reason, note, created_by)
  values (p_hotel_id, v_room.property_id, p_room_id, p_start_date, v_block_end,
          'monthly_tenant', 'สัญญาเช่ารายเดือน', auth.uid())
  returning id into v_block_id;

  insert into public.tenancies
    (hotel_id, property_id, room_id, guest_id, start_date, end_date,
     rent_satang, deposit_satang, block_id, created_by)
  values (p_hotel_id, v_room.property_id, p_room_id, v_guest_id, p_start_date, p_end_date,
          v_rent, v_deposit, v_block_id, auth.uid())
  returning id into v_tenancy_id;

  perform public.log_audit(p_hotel_id, 'tenancy.created', 'tenancy', v_tenancy_id, null,
    jsonb_build_object('room', v_room.room_number, 'start', p_start_date,
                       'rent_satang', v_rent, 'deposit_satang', v_deposit));

  return jsonb_build_object('tenancy_id', v_tenancy_id, 'block_until', v_block_end);
end $$;

-- ── ย้ายออก — ปิดสัญญา + หด/ลบ block (ห้องกลับมาขายรายวันได้) ────────────────
create or replace function public.end_tenancy(
  p_tenancy_id uuid,
  p_end_date date default null                  -- null = วันนี้
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_t record;
  v_end date;
begin
  select * into v_t from public.tenancies where id = p_tenancy_id for update;
  if v_t.id is null then raise exception 'ไม่พบสัญญาเช่า'; end if;
  if not (public.user_can(v_t.hotel_id, 'bookings.edit') or public.is_super_admin()) then
    raise exception 'ไม่มีสิทธิ์' using errcode = '42501';
  end if;
  if v_t.status = 'ended' then raise exception 'สัญญานี้ปิดไปแล้ว'; end if;

  v_end := coalesce(p_end_date, current_date);
  if v_end < v_t.start_date then raise exception 'วันย้ายออกก่อนวันเริ่มสัญญาไม่ได้'; end if;

  update public.tenancies
     set status = 'ended', end_date = v_end, updated_at = now()
   where id = p_tenancy_id;

  -- หด block ให้จบวันที่ย้ายออก (end exclusive) — ถ้าย้ายออกวันเริ่ม = ลบ block
  if v_t.block_id is not null then
    if v_end > v_t.start_date then
      update public.room_blocks set end_date = v_end where id = v_t.block_id;
    else
      delete from public.room_blocks where id = v_t.block_id;
    end if;
  end if;

  perform public.log_audit(v_t.hotel_id, 'tenancy.ended', 'tenancy', p_tenancy_id,
    jsonb_build_object('status', 'active'),
    jsonb_build_object('status', 'ended', 'end_date', v_end));
end $$;

-- ── list ผู้เช่า — RPC pagination ตาม rules #20 (INVOKER ให้ RLS คุม) ─────────
create or replace function public.search_tenancies(
  p_hotel_id uuid,
  p_statuses tenancy_status[] default null,
  p_q text default null,
  p_limit int default 20,
  p_offset int default 0
) returns table (
  id uuid,
  status tenancy_status,
  start_date date,
  end_date date,
  rent_satang bigint,
  deposit_satang bigint,
  room_number text,
  room_type_name text,
  guest_name text,
  guest_phone text,
  total_count bigint
)
language sql stable set search_path = public
as $$
  select t.id, t.status, t.start_date, t.end_date, t.rent_satang, t.deposit_satang,
         r.room_number, rt.name, g.full_name, g.phone,
         count(*) over() as total_count
  from public.tenancies t
  join public.rooms r on r.id = t.room_id
  join public.room_types rt on rt.id = r.room_type_id
  left join public.guests g on g.id = t.guest_id
  where t.hotel_id = p_hotel_id
    and (p_statuses is null or t.status = any(p_statuses))
    and (p_q is null or btrim(p_q) = ''
         or g.full_name ilike '%'||btrim(p_q)||'%'
         or g.phone ilike '%'||btrim(p_q)||'%'
         or r.room_number ilike '%'||btrim(p_q)||'%')
  order by t.created_at desc
  limit least(greatest(p_limit, 1), 100)
  offset greatest(p_offset, 0)
$$;

revoke all on function public.create_tenancy(uuid,uuid,date,date,bigint,bigint,jsonb) from anon;
grant execute on function public.create_tenancy(uuid,uuid,date,date,bigint,bigint,jsonb) to authenticated;
revoke all on function public.end_tenancy(uuid,date) from anon;
grant execute on function public.end_tenancy(uuid,date) to authenticated;
revoke all on function public.search_tenancies(uuid,tenancy_status[],text,int,int) from anon;
grant execute on function public.search_tenancies(uuid,tenancy_status[],text,int,int) to authenticated;
