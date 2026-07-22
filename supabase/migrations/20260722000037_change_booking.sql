-- ============================================================================
-- แก้การจอง: เลื่อนวันเข้าพัก + ย้ายประเภทห้อง (devplan ข้อ 3 · BLUEPRINT §14.2)
-- กติกาเหมือน create_booking เป๊ะ: lock inventory FOR UPDATE ทั้งช่วงเก่า+ใหม่
-- ใน transaction เดียว → คืนของเก่า → เช็คว่าง → ราคาใหม่ (override > ราคาปกติ
-- + ค่าเสริม occupancy) → ตัดของใหม่ → อัปเดต booking/booking_rooms/folio ค่าห้อง
-- ============================================================================

-- ── helper ภายใน: คิดราคาช่วง [p_in, p_out) — สูตรเดียวกับ create_booking ────
-- (caller ต้อง lock inventory + เช็คว่างเอง — ตัวนี้คิดเงินอย่างเดียว)
create or replace function public.calc_room_price(
  p_room_type_id uuid,
  p_rate_plan_id uuid,
  p_in date,
  p_out date,
  p_rooms int,
  p_adults int,
  p_children int
) returns bigint
language plpgsql stable set search_path = public
as $$
declare
  v_rt public.room_types%rowtype;
  v_day date;
  v_price bigint;
  v_closed boolean;
  v_extra_adults int;
  v_extra_children int;
  v_adults_in_base int;
  v_total bigint := 0;
begin
  select * into v_rt from public.room_types where id = p_room_type_id;

  v_extra_adults   := greatest(p_adults - v_rt.base_occupancy * p_rooms, 0);
  v_adults_in_base := p_adults - v_extra_adults;
  v_extra_children := greatest(
    p_children - greatest(v_rt.base_occupancy * p_rooms - v_adults_in_base, 0), 0);

  v_day := p_in;
  while v_day < p_out loop
    select price_satang, closed into v_price, v_closed
      from public.rate_prices
     where rate_plan_id = p_rate_plan_id and room_type_id = p_room_type_id
       and date = v_day;
    if coalesce(v_closed, false) then
      raise exception 'ปิดขายวันที่ %', v_day;
    end if;
    if v_price is null then
      select price_satang into v_price
        from public.rate_base_prices
       where rate_plan_id = p_rate_plan_id and room_type_id = p_room_type_id;
    end if;
    if v_price is null then
      raise exception 'ยังไม่ตั้งราคาวันที่ %', v_day;
    end if;

    v_total := v_total + v_price * p_rooms
               + v_extra_adults * v_rt.extra_adult_satang
               + v_extra_children * v_rt.extra_child_satang;
    v_day := v_day + 1;
  end loop;
  return v_total;
end;
$$;

-- ── helper ภายใน: อัปเดตยอด booking + booking_rooms + folio item ค่าห้อง ─────
create or replace function public._apply_booking_reprice(
  p_booking_id uuid,
  p_new_total bigint,
  p_in date,
  p_out date,
  p_room_type_name text,
  p_rooms int
) returns void
language plpgsql set search_path = public
as $$
declare
  v_prop public.properties%rowtype;
begin
  select pr.* into v_prop
    from public.properties pr
    join public.bookings b on b.property_id = pr.id
   where b.id = p_booking_id;

  update public.bookings
     set check_in = p_in, check_out = p_out, total_satang = p_new_total,
         updated_at = now()
   where id = p_booking_id;

  update public.booking_rooms
     set start_date = p_in, end_date = p_out,
         nights = p_out - p_in,
         price_per_night_satang = p_new_total / p_rooms / greatest(p_out - p_in, 1)
   where booking_id = p_booking_id;

  -- folio item ค่าห้อง (แถวเดียวจาก create_booking) — อัปเดตยอด + snapshot ภาษีใหม่
  update public.folio_items fi
     set description = format('ค่าห้อง %s (%s คืน × %s ห้อง)',
                              p_room_type_name, p_out - p_in, p_rooms),
         unit_price_satang = p_new_total,
         amount_satang = p_new_total,
         vat_satang = case when v_prop.tax_inclusive
           then (p_new_total * v_prop.vat_percent / (100 + v_prop.vat_percent))::bigint
           else (p_new_total * v_prop.vat_percent / 100)::bigint end,
         service_charge_satang = case when v_prop.tax_inclusive
           then (p_new_total * v_prop.service_charge_percent
                 / (100 + v_prop.service_charge_percent))::bigint
           else (p_new_total * v_prop.service_charge_percent / 100)::bigint end
    from public.folios f
   where fi.folio_id = f.id and f.booking_id = p_booking_id
     and fi.category = 'room' and fi.voided_at is null;
end;
$$;

-- ── เลื่อนวันเข้าพัก ─────────────────────────────────────────────────────────
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
  -- เช็คอินแล้ว = แขกอยู่ในห้อง เปลี่ยนได้เฉพาะวันออก (ขยาย/ลดวันพัก)
  if v_b.status = 'checked_in' and p_new_check_in <> v_b.check_in then
    raise exception 'แขกเช็คอินแล้ว — เปลี่ยนได้เฉพาะวันเช็คเอาท์';
  end if;
  if p_new_check_out <= p_new_check_in then
    raise exception 'วันออกต้องหลังวันเข้า';
  end if;
  if p_new_check_in = v_b.check_in and p_new_check_out = v_b.check_out then
    raise exception 'วันเข้าพักเท่าเดิม — ไม่มีอะไรเปลี่ยน';
  end if;

  select * into v_br from public.booking_rooms where booking_id = p_booking_id limit 1;
  select count(*) into v_rooms from public.booking_rooms where booking_id = p_booking_id;
  select name into v_rt_name from public.room_types where id = v_br.room_type_id;

  -- lock inventory ครอบทั้งช่วงเก่า+ใหม่ ใน transaction เดียว (rules #5)
  perform public.ensure_inventory(v_br.room_type_id,
                                  greatest(p_new_check_out, v_b.check_out));
  perform 1 from public.room_type_inventory
    where room_type_id = v_br.room_type_id
      and date >= least(p_new_check_in, v_b.check_in)
      and date <  greatest(p_new_check_out, v_b.check_out)
    for update;

  -- คืนช่วงเก่า → เช็คว่างช่วงใหม่ (หลังคืน — วันทับกันไม่กินโควตาตัวเอง)
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

  v_new_total := public.calc_room_price(
    v_br.room_type_id, v_br.rate_plan_id, p_new_check_in, p_new_check_out,
    v_rooms, v_b.adults, v_b.children);

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

-- ── ย้ายประเภทห้อง (แพ็กเกจราคาเดิม) ────────────────────────────────────────
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

  if v_b.adults + v_b.children > v_new_rt.max_occupancy * v_rooms then
    raise exception 'ห้อง % พักได้สูงสุด % คน/ห้อง — ผู้เข้าพัก % คนเกินเพดาน',
      v_new_rt.name, v_new_rt.max_occupancy, v_b.adults + v_b.children;
  end if;

  -- แพ็กเกจราคาเดิมต้องมีราคาของประเภทใหม่ (calc จะ error ถ้าไม่ตั้ง) — lock ทั้ง 2 ประเภท
  perform public.ensure_inventory(p_new_room_type_id, v_b.check_out);
  perform 1 from public.room_type_inventory
    where room_type_id in (v_br.room_type_id, p_new_room_type_id)
      and date >= v_b.check_in and date < v_b.check_out
    for update;

  -- คืนประเภทเดิม → เช็คว่างประเภทใหม่
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

  v_new_total := public.calc_room_price(
    p_new_room_type_id, v_br.rate_plan_id, v_b.check_in, v_b.check_out,
    v_rooms, v_b.adults, v_b.children);

  update public.room_type_inventory
     set booked = booked + v_rooms, updated_at = now()
   where room_type_id = p_new_room_type_id
     and date >= v_b.check_in and date < v_b.check_out;

  -- เปลี่ยนประเภท + ปลดเบอร์ห้องเดิม (ห้องจริงเป็นของประเภทเก่า)
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

grant execute on function public.change_booking_dates(uuid,date,date) to authenticated;
grant execute on function public.change_booking_room_type(uuid,uuid) to authenticated;
-- helper ไม่ grant — เรียกจากใน RPC (definer) เท่านั้น
revoke execute on function public.calc_room_price(uuid,uuid,date,date,int,int,int) from public, authenticated;
revoke execute on function public._apply_booking_reprice(uuid,bigint,date,date,text,int) from public, authenticated;
