-- แก้บั๊ก room_blocks_apply: ตอน UPDATE block ("หด/ขยาย/ย้ายช่วง") trigger เดิม
-- "บวก blocked ช่วงใหม่ก่อน แล้วค่อยลบช่วงเก่า" → ช่วงที่ซ้อนกันโดนนับ 2 ชั่วขณะ
-- → ชน check constraint inventory_no_overbook ทันที (constraint เช็คต่อแถว ไม่ deferred)
--
-- เจอตอนเทส end_tenancy (หด block ตอนผู้เช่าย้ายออก) — แต่กระทบทุกการแก้ block
-- fix: สลับลำดับ ลบช่วงเก่าก่อน แล้วค่อยบวกช่วงใหม่ (นับขาดชั่วขณะไม่ผิด constraint)

create or replace function public.room_blocks_apply()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_type uuid;
begin
  -- ★ ลบของเก่าก่อน (DELETE/UPDATE) — กันนับซ้อนชั่วขณะตอนช่วงใหม่ทับช่วงเก่า
  if tg_op in ('DELETE', 'UPDATE') then
    select room_type_id into v_type from public.rooms where id = old.room_id;
    update public.room_type_inventory
       set blocked = greatest(blocked - 1, 0), updated_at = now()
     where room_type_id = v_type
       and date >= old.start_date and date < old.end_date;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    select room_type_id into v_type from public.rooms where id = new.room_id;
    perform public.ensure_inventory(v_type, new.end_date);
    update public.room_type_inventory
       set blocked = blocked + 1, updated_at = now()
     where room_type_id = v_type
       and date >= new.start_date and date < new.end_date;  -- exclusive end
  end if;
  return coalesce(new, old);
end;
$$;
