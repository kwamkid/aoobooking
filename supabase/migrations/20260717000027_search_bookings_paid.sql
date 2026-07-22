-- search_bookings v2 — เพิ่ม "วันที่จอง + ยอดชำระแล้ว" (เจ้าของขอ 2026-07-17)
-- paid_satang = sum(payments confirmed: charge - refund) ต่อ booking
-- ยอดค้าง = total_satang - paid_satang (คิดฝั่ง UI)
-- return type เปลี่ยน → ต้อง drop ก่อน (postgres ไม่ให้ replace ข้าม signature ผลลัพธ์)

drop function public.search_bookings(uuid, booking_status[], text, date, date, uuid, uuid, int, int);

create function public.search_bookings(
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
    and (p_from is null or b.check_out > p_from)
    and (p_to is null or b.check_in <= p_to)
    and (p_room_type_id is null or exists (
      select 1 from public.booking_rooms br
      where br.booking_id = b.id and br.room_type_id = p_room_type_id
    ))
  order by b.created_at desc
  limit least(greatest(p_limit, 1), 100)
  offset greatest(p_offset, 0)
$$;

revoke all on function public.search_bookings(uuid,booking_status[],text,date,date,uuid,uuid,int,int) from anon;
grant execute on function public.search_bookings(uuid,booking_status[],text,date,date,uuid,uuid,int,int) to authenticated;
