-- ============================================================================
-- กันเลขจองชน (เจ้าของถาม "digit น้อย กลัวซ้ำ" 2026-07-22)
-- ของเดิม: gen สุ่มล้วน + unique constraint กันซ้ำได้ แต่ comment ใน RPC บอก
-- "retry ถ้าชน" ทั้งที่ไม่มี retry จริง → ชนเมื่อไหร่การจองนั้น error ทั้งรายการ
-- แก้ที่ตัว gen เอง: วนสุ่มจนกว่าจะได้เลขที่ยังว่าง (unique constraint ยังเป็น
-- ตาข่ายชั้นสุดท้ายกัน race) · ครบ 20 ครั้งยังชน (space ใกล้เต็ม) → ขยาย 8 หลัก
-- space: 32^6 ≈ 1,073 ล้านเลข · 32^8 ≈ 1.1 ล้านล้าน
-- ============================================================================

create or replace function public.gen_booking_code()
returns text
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_code text;
  v_len int := 6;
  v_try int := 0;
begin
  loop
    select 'BK-' || string_agg(
             substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ',
                    (floor(random() * 32) + 1)::int, 1), '')
      into v_code
      from generate_series(1, v_len);
    exit when not exists (select 1 from public.bookings where code = v_code);
    v_try := v_try + 1;
    if v_try >= 20 then v_len := 8; end if;
  end loop;
  return v_code;
end;
$$;
