-- ============================================================================
-- ผู้เข้าพักรายห้อง (เจ้าของชี้ 2026-07-22: "ห้อง1 A2K1 · ห้อง2 A1K1 · ห้อง3 A3
-- ระบบเช็คยังไง" — โมเดลรวมทุกห้องแยกไม่ได้ + มีบั๊ก: max เช็คจากยอดรวม ทำให้
-- ห้องเดียวยัด 3 คนผ่านได้ถ้าอีกห้องพักคนเดียว)
-- แก้เป็นแบบ Agoda: ระบุผู้ใหญ่/เด็กต่อห้อง → เช็คเพดาน + คิดค่าเสริมรายห้อง
-- ============================================================================

alter table public.booking_rooms
  add column if not exists adults int not null default 0,
  add column if not exists children int not null default 0;

-- backfill การจองเดิม: ยอดรวมลงแถวแรก (ข้อมูลเดิมส่วนใหญ่จองห้องเดียว)
with firsts as (
  select distinct on (booking_id) id, booking_id
  from public.booking_rooms order by booking_id, created_at
)
update public.booking_rooms br
   set adults = b.adults, children = b.children
  from firsts f
  join public.bookings b on b.id = f.booking_id
 where br.id = f.id;

-- ── create_booking v3: p_room_guests jsonb แทน p_rooms/p_adults/p_children ──
drop function if exists public.create_booking(uuid,uuid,uuid,uuid,date,date,int,int,int,jsonb,booking_channel,int);

create or replace function public.create_booking(
  p_hotel_id uuid,
  p_property_id uuid,
  p_room_type_id uuid,
  p_rate_plan_id uuid,
  p_check_in date,
  p_check_out date,
  p_room_guests jsonb,                   -- [{"adults":2,"children":1}, ...] 1 element/ห้อง
  p_guest jsonb,                         -- {full_name, phone, email} หรือ {guest_id}
  p_channel booking_channel default 'front_desk',
  p_hold_minutes int default null        -- null = confirmed ทันที (front desk)
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_prop public.properties%rowtype;
  v_rt public.room_types%rowtype;
  v_guest_id uuid;
  v_booking_id uuid;
  v_folio_id uuid;
  v_code text;
  v_day date;
  v_available int;
  v_price bigint;
  v_closed boolean;
  v_rooms int;
  v_rg jsonb;
  v_idx int;
  v_a int;
  v_k int;
  v_adults_total int := 0;
  v_children_total int := 0;
  v_extra_satang bigint;      -- ค่าเสริมรวมทุกห้อง (ต่อคืน — คงที่ทุกวัน)
  v_extras bigint[] := '{}';  -- ค่าเสริมรายห้อง (ต่อคืน) ตามลำดับ
  v_base_sum bigint := 0;     -- ราคาห้อง (ไม่รวมค่าเสริม) รวมทุกคืน ต่อ 1 ห้อง
  v_nights int;
  v_grand_total bigint;
  v_deposit bigint := 0;
  v_deposit_policy jsonb;
  v_status booking_status;
  v_hold timestamptz;
  v_vat_pct numeric;
  v_sc_pct numeric;
  v_currency char(3);
  v_extra_a int;
  v_extra_k int;
  v_a_in_base int;
begin
  -- ── สิทธิ์ + validate ──
  if not (public.user_can(p_hotel_id, 'bookings.create') or public.is_super_admin()) then
    raise exception 'ไม่มีสิทธิ์สร้างการจอง' using errcode = '42501';
  end if;
  if p_check_out <= p_check_in then raise exception 'วันออกต้องหลังวันเข้า'; end if;

  v_rooms := coalesce(jsonb_array_length(p_room_guests), 0);
  if v_rooms < 1 then raise exception 'ต้องจองอย่างน้อย 1 ห้อง'; end if;
  v_nights := p_check_out - p_check_in;

  select * into v_prop from public.properties
    where id = p_property_id and hotel_id = p_hotel_id and deleted_at is null;
  if not found then raise exception 'ไม่พบสาขา'; end if;

  select * into v_rt from public.room_types
    where id = p_room_type_id and property_id = p_property_id and deleted_at is null;
  if not found then raise exception 'ไม่พบประเภทห้อง'; end if;

  -- ── validate + ค่าเสริมรายห้อง (โควตา/เพดานคิดต่อห้อง — ไม่ใช่ยอดรวม) ──
  v_extra_satang := 0;
  v_idx := 0;
  for v_rg in select * from jsonb_array_elements(p_room_guests) loop
    v_idx := v_idx + 1;
    v_a := coalesce((v_rg->>'adults')::int, 0);
    v_k := coalesce((v_rg->>'children')::int, 0);
    if v_a < 1 then raise exception 'ห้องที่ % ต้องมีผู้ใหญ่อย่างน้อย 1 คน', v_idx; end if;
    if v_k < 0 then raise exception 'ห้องที่ % จำนวนเด็กติดลบไม่ได้', v_idx; end if;
    if v_a + v_k > v_rt.max_occupancy then
      raise exception 'ห้องที่ %: % พักได้สูงสุด % คน/ห้อง แต่ระบุ % คน',
        v_idx, v_rt.name, v_rt.max_occupancy, v_a + v_k;
    end if;

    v_adults_total := v_adults_total + v_a;
    v_children_total := v_children_total + v_k;

    -- ค่าเสริมต่อห้อง: เติมโควตาพักปกติด้วยผู้ใหญ่ก่อน แล้วค่อยเด็ก (§21.5)
    v_extra_a := greatest(v_a - v_rt.base_occupancy, 0);
    v_a_in_base := v_a - v_extra_a;
    v_extra_k := greatest(v_k - greatest(v_rt.base_occupancy - v_a_in_base, 0), 0);
    v_extras := v_extras
      || (v_extra_a * v_rt.extra_adult_satang + v_extra_k * v_rt.extra_child_satang);
    v_extra_satang := v_extra_satang
      + v_extra_a * v_rt.extra_adult_satang + v_extra_k * v_rt.extra_child_satang;
  end loop;

  v_vat_pct := v_prop.vat_percent;
  v_sc_pct := v_prop.service_charge_percent;
  v_currency := coalesce(v_prop.default_currency,
                (select base_currency from public.hotels where id = p_hotel_id));

  -- ── seed + lock inventory ทุกวัน [check_in, check_out) ──
  perform public.ensure_inventory(p_room_type_id, p_check_out);
  perform 1 from public.room_type_inventory
    where room_type_id = p_room_type_id
      and date >= p_check_in and date < p_check_out
    for update;

  -- ── เช็คว่าง + ราคาห้อง (override > ราคาปกติ · closed = ปิดขาย) ──
  v_day := p_check_in;
  while v_day < p_check_out loop
    select (total - booked - blocked) into v_available
      from public.room_type_inventory
     where room_type_id = p_room_type_id and date = v_day;
    if v_available is null or v_available < v_rooms then
      raise exception 'ห้องไม่พอวันที่ % (เหลือ %)', v_day, coalesce(v_available, 0);
    end if;

    select price_satang, closed into v_price, v_closed
      from public.rate_prices
     where rate_plan_id = p_rate_plan_id and room_type_id = p_room_type_id
       and date = v_day;
    if coalesce(v_closed, false) then raise exception 'ปิดขายวันที่ %', v_day; end if;
    if v_price is null then
      select price_satang into v_price
        from public.rate_base_prices
       where rate_plan_id = p_rate_plan_id and room_type_id = p_room_type_id;
    end if;
    if v_price is null then raise exception 'ยังไม่ตั้งราคาวันที่ %', v_day; end if;

    v_base_sum := v_base_sum + v_price;
    v_day := v_day + 1;
  end loop;

  -- ยอดรวม = (ราคาห้องรวมทุกคืน × จำนวนห้อง) + (ค่าเสริมรวม/คืน × จำนวนคืน)
  v_grand_total := v_base_sum * v_rooms + v_extra_satang * v_nights;

  -- ── upsert guest ──
  if p_guest ? 'guest_id' and (p_guest->>'guest_id') is not null then
    v_guest_id := (p_guest->>'guest_id')::uuid;
  else
    insert into public.guests (hotel_id, full_name, phone, email, nationality, locale)
    values (p_hotel_id, coalesce(p_guest->>'full_name', 'Walk-in'),
            p_guest->>'phone', p_guest->>'email',
            p_guest->>'nationality', p_guest->>'locale')
    returning id into v_guest_id;
  end if;

  -- ── มัดจำจาก deposit_policy ──
  select deposit_policy into v_deposit_policy
    from public.rate_plans where id = p_rate_plan_id;
  v_deposit := case v_deposit_policy->>'type'
    when 'full' then v_grand_total
    when 'percent' then (v_grand_total * (v_deposit_policy->>'value')::numeric / 100)::bigint
    when 'fixed' then ((v_deposit_policy->>'value')::numeric * 100)::bigint
    when 'first_night' then (v_grand_total / greatest(v_nights, 1))
    else 0
  end;

  if p_hold_minutes is null then
    v_status := 'confirmed'; v_hold := null;
  else
    v_status := 'pending'; v_hold := now() + make_interval(mins => p_hold_minutes);
  end if;

  v_code := public.gen_booking_code();
  insert into public.bookings (
    hotel_id, property_id, code, guest_id, channel, status,
    check_in, check_out, adults, children, currency, total_satang,
    deposit_due_satang, hold_expires_at, created_by
  ) values (
    p_hotel_id, p_property_id, v_code, v_guest_id, p_channel, v_status,
    p_check_in, p_check_out, v_adults_total, v_children_total, v_currency, v_grand_total,
    v_deposit, v_hold, auth.uid()
  ) returning id into v_booking_id;

  -- booking_rooms: 1 แถว/ห้อง พร้อมผู้เข้าพัก + ราคาเฉลี่ย/คืนของห้องนั้น
  v_idx := 0;
  for v_rg in select * from jsonb_array_elements(p_room_guests) loop
    v_idx := v_idx + 1;
    insert into public.booking_rooms (
      booking_id, hotel_id, property_id, room_type_id, rate_plan_id,
      start_date, end_date, price_per_night_satang, nights, adults, children
    ) values (
      v_booking_id, p_hotel_id, p_property_id, p_room_type_id, p_rate_plan_id,
      p_check_in, p_check_out,
      (v_base_sum / v_nights) + v_extras[v_idx],
      v_nights,
      (v_rg->>'adults')::int, coalesce((v_rg->>'children')::int, 0)
    );
  end loop;

  -- folio + item ค่าห้อง (VAT/SC snapshot)
  insert into public.folios (booking_id, hotel_id, currency)
  values (v_booking_id, p_hotel_id, v_currency) returning id into v_folio_id;

  insert into public.folio_items (
    folio_id, hotel_id, category, description, qty, unit_price_satang,
    amount_satang, vat_satang, service_charge_satang, posted_by
  ) values (
    v_folio_id, p_hotel_id, 'room',
    format('ค่าห้อง %s (%s คืน × %s ห้อง)', v_rt.name, v_nights, v_rooms),
    1, v_grand_total, v_grand_total,
    case when v_prop.tax_inclusive
      then (v_grand_total * v_vat_pct / (100 + v_vat_pct))::bigint
      else (v_grand_total * v_vat_pct / 100)::bigint end,
    case when v_prop.tax_inclusive
      then (v_grand_total * v_sc_pct / (100 + v_sc_pct))::bigint
      else (v_grand_total * v_sc_pct / 100)::bigint end,
    auth.uid()
  );

  update public.room_type_inventory
     set booked = booked + v_rooms, updated_at = now()
   where room_type_id = p_room_type_id
     and date >= p_check_in and date < p_check_out;

  perform public.log_audit(
    p_hotel_id, 'booking.created', 'booking', v_booking_id,
    null,
    jsonb_build_object('code', v_code, 'total_satang', v_grand_total,
                       'rooms', v_rooms, 'status', v_status,
                       'room_guests', p_room_guests),
    format('%s → %s', p_check_in, p_check_out)
  );

  return jsonb_build_object(
    'booking_id', v_booking_id,
    'code', v_code,
    'total_satang', v_grand_total,
    'deposit_due_satang', v_deposit,
    'status', v_status
  );
end;
$$;

grant execute on function public.create_booking(uuid,uuid,uuid,uuid,date,date,jsonb,jsonb,booking_channel,int)
  to authenticated;

-- ── ปรับ RPC แก้การจอง: คิดราคาใหม่แบบรายห้อง (ตาม adults/children ของแต่ละแถว) ──
create or replace function public.change_booking_dates(
  p_booking_id uuid,
  p_new_check_in date,
  p_new_check_out date
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_b public.bookings%rowtype;
  v_br public.booking_rooms%rowtype;
  v_rooms int;
  v_rt_name text;
  v_day date;
  v_available int;
  v_new_total bigint;
begin
  select * into v_b from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'ไม่พบการจอง'; end if;

  if not (public.user_can(v_b.hotel_id, 'bookings.change_date') or public.is_super_admin()) then
    raise exception 'ไม่มีสิทธิ์เลื่อนวันเข้าพัก' using errcode = '42501';
  end if;
  if v_b.status not in ('pending', 'confirmed', 'checked_in') then
    raise exception 'เลื่อนวันไม่ได้ — การจองปิดแล้ว (สถานะ: %)', v_b.status;
  end if;
  if v_b.status = 'checked_in' and p_new_check_in <> v_b.check_in then
    raise exception 'แขกเช็คอินแล้ว — เปลี่ยนได้เฉพาะวันเช็คเอาท์';
  end if;
  if p_new_check_out <= p_new_check_in then raise exception 'วันออกต้องหลังวันเข้า'; end if;
  if p_new_check_in = v_b.check_in and p_new_check_out = v_b.check_out then
    raise exception 'วันเข้าพักเท่าเดิม — ไม่มีอะไรเปลี่ยน';
  end if;

  select * into v_br from public.booking_rooms where booking_id = p_booking_id limit 1;
  select count(*) into v_rooms from public.booking_rooms where booking_id = p_booking_id;
  select name into v_rt_name from public.room_types where id = v_br.room_type_id;

  perform public.ensure_inventory(v_br.room_type_id,
                                  greatest(p_new_check_out, v_b.check_out));
  perform 1 from public.room_type_inventory
    where room_type_id = v_br.room_type_id
      and date >= least(p_new_check_in, v_b.check_in)
      and date <  greatest(p_new_check_out, v_b.check_out)
    for update;

  update public.room_type_inventory
     set booked = greatest(booked - v_rooms, 0), updated_at = now()
   where room_type_id = v_br.room_type_id
     and date >= v_b.check_in and date < v_b.check_out;

  v_day := p_new_check_in;
  while v_day < p_new_check_out loop
    select (total - booked - blocked) into v_available
      from public.room_type_inventory
     where room_type_id = v_br.room_type_id and date = v_day;
    if v_available is null or v_available < v_rooms then
      raise exception 'ห้องไม่พอวันที่ % (เหลือ %)', v_day, coalesce(v_available, 0);
    end if;
    v_day := v_day + 1;
  end loop;

  -- ราคาใหม่ = ผลรวมรายห้อง (ผู้เข้าพักของแต่ละห้อง)
  select coalesce(sum(public.calc_room_price(
           br2.room_type_id, br2.rate_plan_id, p_new_check_in, p_new_check_out,
           1, br2.adults, br2.children)), 0)::bigint
    into v_new_total
    from public.booking_rooms br2 where br2.booking_id = p_booking_id;

  update public.room_type_inventory
     set booked = booked + v_rooms, updated_at = now()
   where room_type_id = v_br.room_type_id
     and date >= p_new_check_in and date < p_new_check_out;

  perform public._apply_booking_reprice(
    p_booking_id, v_new_total, p_new_check_in, p_new_check_out, v_rt_name, v_rooms);

  perform public.log_audit(
    v_b.hotel_id, 'booking.dates_changed', 'booking', p_booking_id,
    jsonb_build_object('check_in', v_b.check_in, 'check_out', v_b.check_out,
                       'total_satang', v_b.total_satang),
    jsonb_build_object('check_in', p_new_check_in, 'check_out', p_new_check_out,
                       'total_satang', v_new_total)
  );

  return jsonb_build_object(
    'old_total_satang', v_b.total_satang,
    'new_total_satang', v_new_total,
    'diff_satang', v_new_total - v_b.total_satang
  );
end;
$$;

create or replace function public.change_booking_room_type(
  p_booking_id uuid,
  p_new_room_type_id uuid
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_b public.bookings%rowtype;
  v_br public.booking_rooms%rowtype;
  v_rooms int;
  v_new_rt public.room_types%rowtype;
  v_day date;
  v_available int;
  v_new_total bigint;
begin
  select * into v_b from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'ไม่พบการจอง'; end if;

  if not (public.user_can(v_b.hotel_id, 'bookings.move_room') or public.is_super_admin()) then
    raise exception 'ไม่มีสิทธิ์ย้ายห้อง' using errcode = '42501';
  end if;
  if v_b.status not in ('pending', 'confirmed') then
    raise exception 'ย้ายประเภทห้องได้ก่อนเช็คอินเท่านั้น (สถานะ: %)', v_b.status;
  end if;

  select * into v_br from public.booking_rooms where booking_id = p_booking_id limit 1;
  select count(*) into v_rooms from public.booking_rooms where booking_id = p_booking_id;
  if p_new_room_type_id = v_br.room_type_id then
    raise exception 'ประเภทห้องเดิมอยู่แล้ว — ไม่มีอะไรเปลี่ยน';
  end if;

  select * into v_new_rt from public.room_types
   where id = p_new_room_type_id and property_id = v_b.property_id and deleted_at is null;
  if not found then raise exception 'ไม่พบประเภทห้องปลายทาง'; end if;

  -- เพดานคนเช็ค "รายห้อง" (ไม่ใช่ยอดรวม)
  if exists (
    select 1 from public.booking_rooms br2
     where br2.booking_id = p_booking_id
       and br2.adults + br2.children > v_new_rt.max_occupancy
  ) then
    raise exception 'ห้อง % พักได้สูงสุด % คน/ห้อง — มีห้องที่ผู้เข้าพักเกินเพดาน',
      v_new_rt.name, v_new_rt.max_occupancy;
  end if;

  perform public.ensure_inventory(p_new_room_type_id, v_b.check_out);
  perform 1 from public.room_type_inventory
    where room_type_id in (v_br.room_type_id, p_new_room_type_id)
      and date >= v_b.check_in and date < v_b.check_out
    for update;

  update public.room_type_inventory
     set booked = greatest(booked - v_rooms, 0), updated_at = now()
   where room_type_id = v_br.room_type_id
     and date >= v_b.check_in and date < v_b.check_out;

  v_day := v_b.check_in;
  while v_day < v_b.check_out loop
    select (total - booked - blocked) into v_available
      from public.room_type_inventory
     where room_type_id = p_new_room_type_id and date = v_day;
    if v_available is null or v_available < v_rooms then
      raise exception 'ห้อง % ไม่พอวันที่ % (เหลือ %)',
        v_new_rt.name, v_day, coalesce(v_available, 0);
    end if;
    v_day := v_day + 1;
  end loop;

  select coalesce(sum(public.calc_room_price(
           p_new_room_type_id, br2.rate_plan_id, v_b.check_in, v_b.check_out,
           1, br2.adults, br2.children)), 0)::bigint
    into v_new_total
    from public.booking_rooms br2 where br2.booking_id = p_booking_id;

  update public.room_type_inventory
     set booked = booked + v_rooms, updated_at = now()
   where room_type_id = p_new_room_type_id
     and date >= v_b.check_in and date < v_b.check_out;

  update public.booking_rooms
     set room_type_id = p_new_room_type_id, room_id = null
   where booking_id = p_booking_id;

  perform public._apply_booking_reprice(
    p_booking_id, v_new_total, v_b.check_in, v_b.check_out, v_new_rt.name, v_rooms);

  perform public.log_audit(
    v_b.hotel_id, 'booking.room_moved', 'booking', p_booking_id,
    jsonb_build_object('room_type_id', v_br.room_type_id, 'total_satang', v_b.total_satang),
    jsonb_build_object('room_type_id', p_new_room_type_id, 'total_satang', v_new_total)
  );

  return jsonb_build_object(
    'old_total_satang', v_b.total_satang,
    'new_total_satang', v_new_total,
    'diff_satang', v_new_total - v_b.total_satang
  );
end;
$$;
