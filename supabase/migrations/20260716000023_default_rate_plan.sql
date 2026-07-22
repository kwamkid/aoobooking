-- ============================================================================
-- Auto-สร้าง rate plan "ราคาปกติ" ตอนสร้างสาขา (เจ้าของขอ 2026-07-16)
-- โรงแรมส่วนใหญ่มี plan เดียว (จ่ายที่โรงแรม ยกเลิกฟรี) — ไม่ควรต้องรู้จักคำว่า
-- rate plan ก่อนตั้งราคา · UI จะซ่อนเรื่อง plan จนกว่าจะมีมากกว่า 1
-- pattern เดียวกับ default property (migration 000019)
-- ============================================================================

create or replace function public.handle_new_property_rate_plan()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  -- สร้างเฉพาะเมื่อสาขานี้ยังไม่มี plan เลย (กันซ้ำตอน undelete/edge case)
  if not exists (
    select 1 from public.rate_plans
     where property_id = new.id and deleted_at is null
  ) then
    insert into public.rate_plans
      (hotel_id, property_id, name, deposit_policy, cancellation_policy)
    values
      (new.hotel_id, new.id, 'ราคาปกติ',
       '{"type":"none"}'::jsonb,
       '{"type":"free_until","days_before":1}'::jsonb);
  end if;
  return new;
end;
$$;

create trigger z_on_property_created_rate_plan
  after insert on public.properties
  for each row execute function public.handle_new_property_rate_plan();

-- backfill: สาขาที่มีอยู่แล้วแต่ยังไม่มี rate plan → สร้าง "ราคาปกติ" ให้
-- (สาขาที่มี plan อยู่แล้ว เช่นสร้าง Flexible เอง = ไม่แตะ)
insert into public.rate_plans (hotel_id, property_id, name, deposit_policy, cancellation_policy)
select p.hotel_id, p.id, 'ราคาปกติ',
       '{"type":"none"}'::jsonb,
       '{"type":"free_until","days_before":1}'::jsonb
from public.properties p
where p.deleted_at is null
  and not exists (
    select 1 from public.rate_plans rp
     where rp.property_id = p.id and rp.deleted_at is null
  );
