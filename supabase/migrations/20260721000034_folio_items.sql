-- ============================================================================
-- Folio: เพิ่มค่าใช้จ่ายอื่น (อาหาร/มินิบาร์/ซักรีด/สปา) + void (devplan ข้อ 2)
-- + แก้กับดัก: booking_balances.balance เดิม = total − paid (ไม่รวม folio)
--   → เพิ่มค่าอาหารแล้ว guard เช็คเอาท์มองไม่เห็นยอดค้าง — แก้เป็น charges − paid
-- ยอด charge ของ item = amount (tax_inclusive) หรือ amount+vat+sc (tax exclusive)
-- ============================================================================

-- ── booking_balances v2: balance คิดจาก folio จริง ──────────────────────────
-- column type เปลี่ยน numeric→bigint — create or replace ไม่ได้ ต้อง drop ก่อน
-- (function ที่ใช้ view อ้างตอน runtime ไม่มี hard dependency — drop ได้ปลอดภัย)
drop view if exists public.booking_balances;
create view public.booking_balances
with (security_invoker = true) as
select
  b.id as booking_id,
  b.hotel_id,
  b.total_satang,
  coalesce(fi.charges_satang, 0) as folio_charges_satang,
  coalesce(pm.paid_satang, 0) as paid_satang,
  -- ไม่มี folio item (ไม่ควรเกิด — create_booking post ค่าห้องเสมอ) fallback = total
  coalesce(fi.charges_satang, b.total_satang) - coalesce(pm.paid_satang, 0)
    as balance_satang
from public.bookings b
left join lateral (
  select sum(
           i.amount_satang
           + case when pr.tax_inclusive then 0
                  else i.vat_satang + i.service_charge_satang end
         )::bigint as charges_satang
  from public.folio_items i
  join public.folios f on f.id = i.folio_id
  join public.properties pr on pr.id = b.property_id
  where f.booking_id = b.id and i.voided_at is null
) fi on true
left join lateral (
  select sum(case p.direction when 'charge' then p.amount_satang
                              else -p.amount_satang end)::bigint as paid_satang
  from public.payments p
  where p.booking_id = b.id and p.status = 'confirmed'
) pm on true;

-- ── post_folio_item: เพิ่มรายการค่าใช้จ่าย (VAT/SC snapshot ณ ตอน post) ─────
create or replace function public.post_folio_item(
  p_booking_id uuid,
  p_category folio_item_category,
  p_description text,
  p_qty int,
  p_unit_price_satang bigint
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_hotel_id uuid;
  v_status booking_status;
  v_property_id uuid;
  v_folio_id uuid;
  v_amount bigint;
  v_vat numeric;
  v_sc numeric;
  v_inclusive boolean;
  v_item_id uuid;
begin
  select hotel_id, status, property_id into v_hotel_id, v_status, v_property_id
    from public.bookings where id = p_booking_id;
  if v_hotel_id is null then raise exception 'ไม่พบการจอง'; end if;

  if not (public.user_can(v_hotel_id, 'folio.add_charge') or public.is_super_admin()) then
    raise exception 'ไม่มีสิทธิ์เพิ่มรายการค่าใช้จ่าย' using errcode = '42501';
  end if;
  if v_status in ('cancelled', 'checked_out', 'no_show') then
    raise exception 'เพิ่มรายการไม่ได้ — การจองปิดแล้ว (สถานะ: %)', v_status;
  end if;
  if coalesce(trim(p_description), '') = '' then raise exception 'กรอกรายละเอียดรายการ'; end if;
  if p_qty < 1 then raise exception 'จำนวนต้องอย่างน้อย 1'; end if;
  if p_unit_price_satang <= 0 then raise exception 'ราคาต่อหน่วยต้องมากกว่า 0'; end if;
  if p_category = 'room' then
    raise exception 'ค่าห้องระบบบันทึกอัตโนมัติ — เลือกหมวดอื่น';
  end if;

  select id into v_folio_id from public.folios where booking_id = p_booking_id;
  if v_folio_id is null then
    insert into public.folios (booking_id, hotel_id, currency)
    select p_booking_id, v_hotel_id, currency from public.bookings where id = p_booking_id
    returning id into v_folio_id;
  end if;

  select vat_percent, service_charge_percent, tax_inclusive
    into v_vat, v_sc, v_inclusive
    from public.properties where id = v_property_id;
  v_amount := p_qty * p_unit_price_satang;

  insert into public.folio_items (
    folio_id, hotel_id, category, description, qty, unit_price_satang,
    amount_satang, vat_satang, service_charge_satang, posted_by
  ) values (
    v_folio_id, v_hotel_id, p_category, trim(p_description), p_qty, p_unit_price_satang,
    v_amount,
    -- สูตรเดียวกับ create_booking: inclusive แตก backward · exclusive คำนวณบวก
    case when v_inclusive then (v_amount * v_vat / (100 + v_vat))::bigint
         else (v_amount * v_vat / 100)::bigint end,
    case when v_inclusive then (v_amount * v_sc / (100 + v_sc))::bigint
         else (v_amount * v_sc / 100)::bigint end,
    auth.uid()
  ) returning id into v_item_id;

  perform public.log_audit(
    v_hotel_id, 'folio.item_posted', 'folio_item', v_item_id,
    null, jsonb_build_object('category', p_category, 'description', trim(p_description),
                             'qty', p_qty, 'amount_satang', v_amount)
  );
  return v_item_id;
end;
$$;

-- ── void_folio_item: ตีรายการเป็นโมฆะ (ห้ามลบ row — BLUEPRINT §17) ──────────
create or replace function public.void_folio_item(
  p_item_id uuid,
  p_reason text
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_hotel_id uuid;
  v_category folio_item_category;
  v_voided timestamptz;
  v_amount bigint;
begin
  select hotel_id, category, voided_at, amount_satang
    into v_hotel_id, v_category, v_voided, v_amount
    from public.folio_items where id = p_item_id for update;
  if v_hotel_id is null then raise exception 'ไม่พบรายการ'; end if;

  if not (public.user_can(v_hotel_id, 'folio.void_charge') or public.is_super_admin()) then
    raise exception 'ไม่มีสิทธิ์ยกเลิกรายการค่าใช้จ่าย' using errcode = '42501';
  end if;
  if v_voided is not null then raise exception 'รายการนี้ถูกยกเลิกไปแล้ว'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'ต้องระบุเหตุผลที่ยกเลิก'; end if;
  if v_category = 'room' then
    raise exception 'ค่าห้อง void ไม่ได้ — ใช้แก้วันเข้าพัก/ยกเลิกการจองแทน';
  end if;

  update public.folio_items
     set voided_at = now(), voided_by = auth.uid(), void_reason = trim(p_reason)
   where id = p_item_id;

  perform public.log_audit(
    v_hotel_id, 'folio.item_voided', 'folio_item', p_item_id,
    jsonb_build_object('amount_satang', v_amount),
    jsonb_build_object('voided', true), trim(p_reason)
  );
end;
$$;

grant execute on function public.post_folio_item(uuid,folio_item_category,text,int,bigint)
  to authenticated;
grant execute on function public.void_folio_item(uuid,text) to authenticated;

-- ── search_bookings v3: เพิ่ม charges_satang (ยอดรวม folio จริง — หน้า list
-- โชว์ยอด/ค้างถูกแม้มีค่าอาหาร) · return type เปลี่ยน → ต้อง drop ก่อน ─────────
drop function if exists public.search_bookings(uuid,booking_status[],text,date,date,uuid,uuid,int,int);

create or replace function public.search_bookings(
  p_hotel_id uuid,
  p_statuses booking_status[] default null,
  p_q text default null,
  p_from date default null,
  p_to date default null,
  p_room_type_id uuid default null,
  p_property_id uuid default null,
  p_limit int default 20,
  p_offset int default 0
) returns table (
  id uuid,
  code text,
  status booking_status,
  check_in date,
  check_out date,
  created_at timestamptz,
  total_satang bigint,
  paid_satang bigint,
  charges_satang bigint,
  guest_name text,
  guest_phone text,
  guest_email text,
  total_count bigint
)
language sql stable set search_path = public
as $$
  select
    b.id, b.code, b.status, b.check_in, b.check_out, b.created_at, b.total_satang,
    coalesce((
      select sum(case p.direction when 'charge' then p.amount_satang
                                  else -p.amount_satang end)
      from public.payments p
      where p.booking_id = b.id and p.status = 'confirmed'
    ), 0)::bigint as paid_satang,
    coalesce((
      select sum(i.amount_satang
                 + case when pr.tax_inclusive then 0
                        else i.vat_satang + i.service_charge_satang end)
      from public.folio_items i
      join public.folios f on f.id = i.folio_id
      join public.properties pr on pr.id = b.property_id
      where f.booking_id = b.id and i.voided_at is null
    ), b.total_satang)::bigint as charges_satang,
    g.full_name, g.phone, g.email,
    count(*) over() as total_count
  from public.bookings b
  left join public.guests g on g.id = b.guest_id
  where b.hotel_id = p_hotel_id
    and (p_statuses is null or b.status = any(p_statuses))
    and (p_property_id is null or b.property_id = p_property_id)
    and (
      p_q is null or btrim(p_q) = ''
      or b.code ilike '%' || btrim(p_q) || '%'
      or g.full_name ilike '%' || btrim(p_q) || '%'
      or g.phone ilike '%' || btrim(p_q) || '%'
      or g.email ilike '%' || btrim(p_q) || '%'
    )
    -- วันเช็คอินอยู่ในช่วง [p_from, p_to]
    and (p_from is null or b.check_in >= p_from)
    and (p_to is null or b.check_in <= p_to)
    and (p_room_type_id is null or exists (
      select 1 from public.booking_rooms br
      where br.booking_id = b.id and br.room_type_id = p_room_type_id
    ))
  order by b.created_at desc
  limit least(greatest(p_limit, 1), 100)
  offset greatest(p_offset, 0)
$$;
