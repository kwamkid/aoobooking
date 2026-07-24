-- ============================================================================
-- เวลาเช็คอิน/เช็คเอาท์จริง (เจ้าของขอ 2026-07-23: จอง 22–23 แต่มาเช็คอิน 23
-- ตารางไม่บอกว่าแขกเข้าจริงเมื่อไหร่) — check_in/check_out เดิมเป็นแค่ "วันที่จอง"
-- · คอลัมน์ใหม่ checked_in_at / checked_out_at stamp ใน RPC ตอนกดจริง
-- · backfill ย้อนหลังจาก audit_logs (booking.checked_in / checked_out)
-- · search_bookings v6 คืน 2 คอลัมน์นี้ → ตารางการจองโชว์บรรทัดรอง
-- ============================================================================

alter table public.bookings
  add column if not exists checked_in_at timestamptz,
  add column if not exists checked_out_at timestamptz;

-- backfill จาก audit log (ครั้งล่าสุดของแต่ละ booking)
update public.bookings b
   set checked_in_at = a.ts
  from (
    select entity_id, max(created_at) as ts
      from public.audit_logs
     where action = 'booking.checked_in' and entity_type = 'booking'
     group by entity_id
  ) a
 where a.entity_id = b.id and b.checked_in_at is null;

update public.bookings b
   set checked_out_at = a.ts
  from (
    select entity_id, max(created_at) as ts
      from public.audit_logs
     where action = 'booking.checked_out' and entity_type = 'booking'
     group by entity_id
  ) a
 where a.entity_id = b.id and b.checked_out_at is null;

-- ── check_in_booking: เพิ่ม stamp checked_in_at (โครงเดิม mig 15) ────────────
create or replace function public.check_in_booking(
  p_booking_id uuid,
  p_room_assignments jsonb default '[]'::jsonb
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_hotel_id uuid;
  v_status booking_status;
  v_a jsonb;
begin
  select hotel_id, status into v_hotel_id, v_status
    from public.bookings where id = p_booking_id;
  if v_hotel_id is null then raise exception 'ไม่พบการจอง'; end if;

  if not (public.user_can(v_hotel_id, 'bookings.checkin') or public.is_super_admin()) then
    raise exception 'ไม่มีสิทธิ์เช็คอิน' using errcode = '42501';
  end if;
  if v_status <> 'confirmed' then
    raise exception 'เช็คอินได้เฉพาะการจองที่ยืนยันแล้ว (สถานะปัจจุบัน: %)', v_status;
  end if;

  -- assign room จริงลง booking_rooms (ถ้าส่งมา)
  for v_a in select * from jsonb_array_elements(p_room_assignments)
  loop
    update public.booking_rooms
       set room_id = (v_a->>'room_id')::uuid
     where id = (v_a->>'booking_room_id')::uuid and booking_id = p_booking_id;
  end loop;

  update public.bookings
     set status = 'checked_in', checked_in_at = now(), updated_at = now()
   where id = p_booking_id;

  perform public.log_audit(
    v_hotel_id, 'booking.checked_in', 'booking', p_booking_id,
    jsonb_build_object('status', 'confirmed'),
    jsonb_build_object('status', 'checked_in')
  );
end;
$$;

-- ── check_out_booking: เพิ่ม stamp checked_out_at (โครงเดิม mig 15) ──────────
create or replace function public.check_out_booking(p_booking_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_hotel_id uuid;
  v_status booking_status;
  v_balance bigint;
begin
  select hotel_id, status into v_hotel_id, v_status
    from public.bookings where id = p_booking_id;
  if v_hotel_id is null then raise exception 'ไม่พบการจอง'; end if;

  if not (public.user_can(v_hotel_id, 'bookings.checkout') or public.is_super_admin()) then
    raise exception 'ไม่มีสิทธิ์เช็คเอาท์' using errcode = '42501';
  end if;
  if v_status <> 'checked_in' then
    raise exception 'เช็คเอาท์ได้เฉพาะแขกที่เช็คอินแล้ว (สถานะปัจจุบัน: %)', v_status;
  end if;

  -- ยอดค้างต้อง = 0 (จาก view booking_balances)
  select balance_satang into v_balance
    from public.booking_balances where booking_id = p_booking_id;
  if coalesce(v_balance, 0) <> 0 then
    raise exception 'ยังมียอดค้างชำระ % สตางค์ — เก็บเงินให้ครบก่อนเช็คเอาท์', v_balance;
  end if;

  update public.bookings
     set status = 'checked_out', checked_out_at = now(), updated_at = now()
   where id = p_booking_id;

  -- ห้องที่แขกใช้ → dirty (housekeeping)
  update public.rooms r
     set housekeeping_status = 'dirty', updated_at = now()
    from public.booking_rooms br
   where br.booking_id = p_booking_id and br.room_id = r.id;

  perform public.log_audit(
    v_hotel_id, 'booking.checked_out', 'booking', p_booking_id,
    jsonb_build_object('status', 'checked_in'),
    jsonb_build_object('status', 'checked_out')
  );
end;
$$;

-- ── search_bookings v6: เพิ่ม checked_in_at / checked_out_at ─────────────────
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
  ota_reference text,
  status booking_status,
  check_in date,
  check_out date,
  checked_in_at timestamptz,
  checked_out_at timestamptz,
  created_at timestamptz,
  total_satang bigint,
  paid_satang bigint,
  charges_satang bigint,
  room_numbers text,
  guest_id uuid,
  guest_name text,
  guest_phone text,
  guest_email text,
  total_count bigint
)
language sql stable set search_path = public
as $$
  select
    b.id, b.code, b.ota_reference, b.status, b.check_in, b.check_out,
    b.checked_in_at, b.checked_out_at, b.created_at,
    b.total_satang,
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
    (
      select string_agg(r.room_number, ', ' order by r.room_number)
      from public.booking_rooms br
      join public.rooms r on r.id = br.room_id
      where br.booking_id = b.id
    ) as room_numbers,
    g.id as guest_id, g.full_name, g.phone, g.email,
    count(*) over() as total_count
  from public.bookings b
  left join public.guests g on g.id = b.guest_id
  where b.hotel_id = p_hotel_id
    and (p_statuses is null or b.status = any(p_statuses))
    and (p_property_id is null or b.property_id = p_property_id)
    and (
      p_q is null or btrim(p_q) = ''
      or b.code ilike '%' || btrim(p_q) || '%'
      or b.ota_reference ilike '%' || btrim(p_q) || '%'
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
