-- RPC pagination หน้าการจอง (เจ้าของสั่ง 2026-07-17: "ตารางใช้ pagination + lazy load
-- + พยายามใช้ rpc pagination") — ดึงทีละหน้า + filter ครบใน query เดียว
--
-- filter: สถานะ · ค้นหา (ชื่อ/เบอร์/email/โค้ด — ข้ามตาราง guests) · ช่วงวันที่
-- (การเข้าพักคาบเกี่ยวช่วง ไม่ใช่แค่วันเช็คอิน) · ประเภทห้อง · สาขา
-- total_count = count(*) over() แถวแรก → client รู้จำนวนหน้าโดยไม่ยิงซ้ำ
--
-- SECURITY INVOKER (default) โดยตั้งใจ — ให้ RLS ของ bookings/guests คุมสิทธิ์
-- ตามปกติ (member-select) ไม่ bypass

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
  total_satang bigint,
  guest_name text,
  guest_phone text,
  guest_email text,
  total_count bigint
)
language sql stable set search_path = public
as $$
  select
    b.id, b.code, b.status, b.check_in, b.check_out, b.total_satang,
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
    -- ช่วงวันที่ = การเข้าพัก "คาบเกี่ยว" ช่วงที่เลือก (ถาม "ใครพักช่วงสงกรานต์" ได้)
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

-- นับต่อสถานะ (FilterTabs) — แถวเดียวต่อสถานะ เบากว่าดึงทุกแถวมานับฝั่ง app
create or replace function public.booking_status_counts(p_hotel_id uuid)
returns table (status booking_status, cnt bigint)
language sql stable set search_path = public
as $$
  select b.status, count(*)::bigint
  from public.bookings b
  where b.hotel_id = p_hotel_id
  group by b.status
$$;

revoke all on function public.search_bookings(uuid,booking_status[],text,date,date,uuid,uuid,int,int) from anon;
grant execute on function public.search_bookings(uuid,booking_status[],text,date,date,uuid,uuid,int,int) to authenticated;
revoke all on function public.booking_status_counts(uuid) from anon;
grant execute on function public.booking_status_counts(uuid) to authenticated;
