-- ============================================================================
-- Auto-สร้าง "สาขาหลัก" ตอนสร้างโรงแรม (เจ้าของขอ 2026-07-14)
-- โรงแรมที่ไม่มีสาขาย่อยก็ใช้งานได้เลย ไม่ต้องมาสร้างสาขาเอง
-- trigger แยกจาก owner trigger (on_hotel_created) — SECURITY DEFINER (ข้าม RLS)
-- ============================================================================

create or replace function public.handle_new_hotel_property()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.properties (hotel_id, slug, name)
  values (new.id, 'main', 'สาขาหลัก')
  on conflict (hotel_id, slug) do nothing;
  return new;
end;
$$;

-- ทำงานหลัง owner trigger (ชื่อ trigger เรียงตามตัวอักษร: 'a' < 'on' ไม่การันตี — แยกชื่อ z_)
create trigger z_on_hotel_created_property
  after insert on public.hotels
  for each row execute function public.handle_new_hotel_property();

-- backfill: โรงแรมที่มีอยู่แล้วแต่ยังไม่มีสาขา → สร้างสาขาหลักให้
insert into public.properties (hotel_id, slug, name)
select h.id, 'main', 'สาขาหลัก'
from public.hotels h
where not exists (
  select 1 from public.properties p where p.hotel_id = h.id and p.deleted_at is null
)
on conflict (hotel_id, slug) do nothing;
