-- ============================================================================
-- hotels.multi_property flag (เจ้าของขอ 2026-07-14)
-- โรงแรมมี property หลักเสมอ (auto-สร้าง) แต่ซ่อน UI "สาขา" จนกว่าติ๊กเปิด
-- false = โรงแรมที่เดียว (ไม่โชว์ switcher/เมนูสาขา) · true = หลายสาขา (โชว์ครบ)
-- ============================================================================

alter table public.hotels
  add column if not exists multi_property boolean not null default false;

-- โรงแรมที่มี property > 1 อยู่แล้ว → เปิด multi_property อัตโนมัติ (กันซ่อนผิด)
update public.hotels h
set multi_property = true
where (select count(*) from public.properties p
       where p.hotel_id = h.id and p.deleted_at is null) > 1;
