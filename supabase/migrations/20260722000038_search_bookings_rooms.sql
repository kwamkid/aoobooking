-- ============================================================================
-- search_bookings v5: เพิ่ม room_numbers (เบอร์ห้องที่ assign แล้ว คั่น ", ")
-- โชว์ RoomBadge ในตารางการจอง (เจ้าของขอ 2026-07-22) · return เปลี่ยน → drop
-- ============================================================================

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
    b.id, b.code, b.ota_reference, b.status, b.check_in, b.check_out, b.created_at,
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
