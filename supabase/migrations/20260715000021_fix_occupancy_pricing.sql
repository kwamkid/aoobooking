-- แก้ 2 บั๊กเรื่อง occupancy ใน create_booking (เจ้าของยืนยัน 2026-07-15)
--
-- บั๊ก 1 — max_occupancy ไม่เคยถูกเช็ค → จองเกินเพดานคนของห้องได้
-- บั๊ก 2 — เด็กคิดค่าเสริมตั้งแต่คนแรก (p_children * extra_child) ทั้งที่ UI เขียนว่า
--          "ค่าเสริมเมื่อพักเกินจำนวนปกติ" → 1 ผู้ใหญ่ + 1 เด็ก (พักปกติ 2) ก็โดนคิด
--
-- กติกาใหม่: เด็กนับรวมกับผู้ใหญ่ เกิน base_occupancy ถึงคิด (เติมโควตาด้วยผู้ใหญ่ก่อน)
--   พักปกติ 2 · ผู้ใหญ่+500 · เด็ก+300
--     1 ผู้ใหญ่ + 1 เด็ก (รวม 2) → ไม่คิดเพิ่ม
--     2 ผู้ใหญ่ + 1 เด็ก (รวม 3) → +300
--     3 ผู้ใหญ่ + 1 เด็ก (รวม 4) → +500 +300
--
-- แถม: ค่าเสริมเดิมคูณ p_rooms ซ้ำ (คนละคูณห้อง) — แก้ให้คิดต่อ "คน" ตามความหมายจริง

create or replace function public.create_booking(
  p_hotel_id uuid,
  p_property_id uuid,
  p_room_type_id uuid,
  p_rate_plan_id uuid,
  p_check_in date,
  p_check_out date,
  p_rooms int,
  p_adults int,
  p_children int,
  p_guest jsonb,                          -- {full_name, phone, email, id?, ...} หรือ {guest_id}
  p_channel booking_channel default 'front_desk',
  p_hold_minutes int default null        -- null = confirmed ทันที (front desk) · มีค่า = pending+hold
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
  v_night_total bigint;
  v_extra_adults int;
  v_extra_children int;
  v_adults_in_base int;
  v_grand_total bigint := 0;
  v_deposit bigint := 0;
  v_deposit_policy jsonb;
  v_status booking_status;
  v_hold timestamptz;
  v_vat_pct numeric;
  v_sc_pct numeric;
  v_currency char(3);
begin
  -- ── สิทธิ์ ──
  if not (public.user_can(p_hotel_id, 'bookings.create') or public.is_super_admin()) then
    raise exception 'ไม่มีสิทธิ์สร้างการจอง' using errcode = '42501';
  end if;
  if p_check_out <= p_check_in then
    raise exception 'วันออกต้องหลังวันเข้า';
  end if;
  if p_rooms < 1 then
    raise exception 'ต้องจองอย่างน้อย 1 ห้อง';
  end if;
  if p_adults < 1 then
    raise exception 'ต้องมีผู้ใหญ่อย่างน้อย 1 คน';
  end if;
  if p_children < 0 then
    raise exception 'จำนวนเด็กติดลบไม่ได้';
  end if;

  select * into v_prop from public.properties
    where id = p_property_id and hotel_id = p_hotel_id and deleted_at is null;
  if not found then raise exception 'ไม่พบสาขา'; end if;

  select * into v_rt from public.room_types
    where id = p_room_type_id and property_id = p_property_id and deleted_at is null;
  if not found then raise exception 'ไม่พบประเภทห้อง'; end if;

  -- กันจองเกินเพดานคนของห้อง (โควตาคิดต่อห้อง × จำนวนห้องที่จอง)
  if p_adults + p_children > v_rt.max_occupancy * p_rooms then
    raise exception 'ห้อง % พักได้สูงสุด % คน/ห้อง — จอง % ห้องรับได้ % คน แต่ขอ % คน',
      v_rt.name, v_rt.max_occupancy, p_rooms, v_rt.max_occupancy * p_rooms,
      p_adults + p_children;
  end if;

  v_vat_pct := v_prop.vat_percent;
  v_sc_pct := v_prop.service_charge_percent;
  v_currency := coalesce(v_prop.default_currency,
                (select base_currency from public.hotels where id = p_hotel_id));

  -- ค่าเสริม: เด็กนับรวมกับผู้ใหญ่ · เติมโควตา "พักปกติ" ด้วยผู้ใหญ่ก่อน แล้วค่อยเด็ก (§21.5)
  -- โควตาคิดต่อห้อง → จอง N ห้อง ได้โควตา base_occupancy × N
  v_extra_adults   := greatest(p_adults - v_rt.base_occupancy * p_rooms, 0);
  v_adults_in_base := p_adults - v_extra_adults;   -- ผู้ใหญ่ที่กินโควตาไปแล้ว
  v_extra_children := greatest(
    p_children - greatest(v_rt.base_occupancy * p_rooms - v_adults_in_base, 0), 0);

  -- ── seed inventory ให้ครอบช่วง (กันเคสยังไม่มีแถว) แล้ว lock ──
  perform public.ensure_inventory(p_room_type_id, p_check_out);

  -- lock แถว inventory ทุกวันที่จะพัก [check_in, check_out) — FOR UPDATE สำคัญสุด
  perform 1 from public.room_type_inventory
    where room_type_id = p_room_type_id
      and date >= p_check_in and date < p_check_out
    for update;

  -- ── เช็ค available + คำนวณราคาทุกวัน (loop < check_out — off-by-one guard) ──
  v_day := p_check_in;
  while v_day < p_check_out loop
    -- available พอไหม
    select (total - booked - blocked) into v_available
      from public.room_type_inventory
     where room_type_id = p_room_type_id and date = v_day;
    if v_available is null or v_available < p_rooms then
      raise exception 'ห้องไม่พอวันที่ % (เหลือ %)', v_day, coalesce(v_available, 0);
    end if;

    -- ราคาต่อคืนจาก rate_prices (+ extra occupancy) — closed = ปิดขาย
    select price_satang into v_price
      from public.rate_prices
     where rate_plan_id = p_rate_plan_id and room_type_id = p_room_type_id
       and date = v_day and not closed;
    if v_price is null then
      raise exception 'ยังไม่ตั้งราคาวันที่ % (หรือปิดขาย)', v_day;
    end if;

    -- ราคาห้องคูณจำนวนห้อง · ค่าเสริมคิดต่อ "คน" ที่เกินโควตา (ไม่คูณ p_rooms ซ้ำ)
    v_night_total := v_price * p_rooms
                     + v_extra_adults * v_rt.extra_adult_satang
                     + v_extra_children * v_rt.extra_child_satang;
    v_grand_total := v_grand_total + v_night_total;

    v_day := v_day + 1;
  end loop;

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
    when 'fixed' then ((v_deposit_policy->>'value')::numeric * 100)::bigint  -- value = บาท
    when 'first_night' then (v_grand_total / greatest(p_check_out - p_check_in, 1))
    else 0  -- 'none'
  end;

  -- front desk (hold null) = confirmed ทันที · online = pending + hold
  if p_hold_minutes is null then
    v_status := 'confirmed';
    v_hold := null;
  else
    v_status := 'pending';
    v_hold := now() + make_interval(mins => p_hold_minutes);
  end if;

  -- ── insert booking (+ retry code ถ้าชน unique) ──
  v_code := public.gen_booking_code();
  insert into public.bookings (
    hotel_id, property_id, code, guest_id, channel, status,
    check_in, check_out, adults, children, currency, total_satang,
    deposit_due_satang, hold_expires_at, created_by
  ) values (
    p_hotel_id, p_property_id, v_code, v_guest_id, p_channel, v_status,
    p_check_in, p_check_out, p_adults, p_children, v_currency, v_grand_total,
    v_deposit, v_hold, auth.uid()
  ) returning id into v_booking_id;

  -- booking_rooms (1 segment/ห้อง — เส้นแคบสุด: 1 segment ครอบทั้ง stay ต่อห้อง)
  insert into public.booking_rooms (
    booking_id, hotel_id, property_id, room_type_id, rate_plan_id,
    start_date, end_date, price_per_night_satang, nights
  )
  select v_booking_id, p_hotel_id, p_property_id, p_room_type_id, p_rate_plan_id,
         p_check_in, p_check_out,
         (v_grand_total / p_rooms / greatest(p_check_out - p_check_in, 1)),
         (p_check_out - p_check_in)
  from generate_series(1, p_rooms);

  -- folio + folio_item ค่าห้อง (พร้อม VAT/SC snapshot — tax_inclusive backward split)
  insert into public.folios (booking_id, hotel_id, currency)
  values (v_booking_id, p_hotel_id, v_currency) returning id into v_folio_id;

  insert into public.folio_items (
    folio_id, hotel_id, category, description, qty, unit_price_satang,
    amount_satang, vat_satang, service_charge_satang, posted_by
  ) values (
    v_folio_id, p_hotel_id, 'room',
    format('ค่าห้อง %s (%s คืน × %s ห้อง)', v_rt.name, p_check_out - p_check_in, p_rooms),
    1, v_grand_total, v_grand_total,
    -- snapshot ภาษี: tax_inclusive → แตกยอด backward · exclusive → คำนวณบวก
    case when v_prop.tax_inclusive
      then (v_grand_total * v_vat_pct / (100 + v_vat_pct))::bigint
      else (v_grand_total * v_vat_pct / 100)::bigint end,
    case when v_prop.tax_inclusive
      then (v_grand_total * v_sc_pct / (100 + v_sc_pct))::bigint
      else (v_grand_total * v_sc_pct / 100)::bigint end,
    auth.uid()
  );

  -- ── ตัด inventory: booked + p_rooms ทุกวัน (loop < check_out) ──
  update public.room_type_inventory
     set booked = booked + p_rooms, updated_at = now()
   where room_type_id = p_room_type_id
     and date >= p_check_in and date < p_check_out;

  -- ── log ──
  perform public.log_audit(
    p_hotel_id, 'booking.created', 'booking', v_booking_id,
    null,
    jsonb_build_object('code', v_code, 'total_satang', v_grand_total,
                       'rooms', p_rooms, 'status', v_status),
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
