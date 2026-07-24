-- ============================================================================
-- No-show (BLUEPRINT §14 ตาราง lifecycle: ตั้ง status=no_show + ตาม policy
-- "ปกติยึดมัดจำ") — devplan §ทำการจองให้สมบูรณ์ ข้อ 4
-- · สิทธิ์ใช้ bookings.cancel ร่วมกับยกเลิก (เรื่องเงิน/ปล่อยห้อง — front_desk
--   ปิด default เหมือนกัน) ไม่เพิ่ม permission ใหม่
-- · คืน inventory เฉพาะคืนที่ยังขายได้ (>= วันนี้) — คืนที่ผ่านมาห้องเสียเปล่า
--   ไปแล้ว ปล่อยตัวเลข booked ไว้ตามจริง (ต่างจาก cancel ที่คืนทั้งช่วง)
-- · เงินที่ชำระ: คิดตาม cancellation_policy ด้วย days_before = check_in − วันนี้
--   (≤ 0 เสมอ เพราะทำได้ตั้งแต่วันเข้าพัก) — ไม่มี policy = ยึดทั้งหมด
--   (กลับด้านกับ cancel ที่ไม่มี policy = คืนเต็ม — no-show คือแขกผิดนัดเอง)
-- ============================================================================

create or replace function public.mark_no_show(
  p_booking_id uuid,
  p_reason text default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_hotel_id uuid;
  v_status booking_status;
  v_check_in date;
  v_paid bigint;
  v_policy jsonb;
  v_days_before int;
  v_refund bigint := 0;
  v_refund_pct numeric := 0;
  v_rule jsonb;
begin
  select b.hotel_id, b.status, b.check_in
    into v_hotel_id, v_status, v_check_in
    from public.bookings b where b.id = p_booking_id for update;
  if v_hotel_id is null then raise exception 'ไม่พบการจอง'; end if;

  if not (public.user_can(v_hotel_id, 'bookings.cancel') or public.is_super_admin()) then
    raise exception 'ไม่มีสิทธิ์บันทึก No-show' using errcode = '42501';
  end if;
  if v_status not in ('pending', 'confirmed') then
    raise exception 'บันทึก No-show ไม่ได้ (สถานะ: %)', v_status;
  end if;
  if current_date < v_check_in then
    raise exception 'ยังไม่ถึงวันเข้าพัก — บันทึก No-show ได้ตั้งแต่วันเข้าพักเป็นต้นไป';
  end if;

  -- คืน inventory คืนที่เหลือ (นับห้องต่อ type/ช่วง แล้วลบทีเดียว — บทเรียน mig 40)
  update public.room_type_inventory inv
     set booked = greatest(inv.booked - sub.cnt, 0), updated_at = now()
    from (
      select room_type_id, start_date, end_date, count(*)::int as cnt
        from public.booking_rooms
       where booking_id = p_booking_id
       group by room_type_id, start_date, end_date
    ) sub
   where inv.room_type_id = sub.room_type_id
     and inv.date >= greatest(sub.start_date, current_date)
     and inv.date < sub.end_date;

  -- ยอดจ่ายจริง (confirmed) → คิดยอดคืนตาม policy เดียวกับ cancel (§14.4)
  select coalesce(paid_satang, 0) into v_paid
    from public.booking_balances where booking_id = p_booking_id;

  select cancellation_policy into v_policy
    from public.rate_plans rp
    join public.booking_rooms br on br.rate_plan_id = rp.id
   where br.booking_id = p_booking_id limit 1;
  v_days_before := v_check_in - current_date;

  if v_policy->>'type' = 'free_until' then
    v_refund := case when v_days_before >= (v_policy->>'days_before')::int
                     then v_paid else 0 end;
  elsif v_policy->>'type' = 'tiered' then
    for v_rule in select * from jsonb_array_elements(v_policy->'rules')
    loop
      if v_days_before >= (v_rule->>'days_before')::int then
        v_refund_pct := (v_rule->>'refund_percent')::numeric;
        exit;
      end if;
    end loop;
    v_refund := (v_paid * v_refund_pct / 100)::bigint;
  else
    v_refund := 0;  -- non_refundable / ไม่มี policy = ยึดทั้งหมด (แขกผิดนัด)
  end if;

  update public.bookings
     set status = 'no_show', cancel_reason = p_reason, updated_at = now()
   where id = p_booking_id;

  -- มียอดต้องคืน (policy ใจดี) → สร้าง refund pending ไปยืนยันคืนจริงใน payment modal
  if v_refund > 0 then
    insert into public.payments (
      hotel_id, booking_id, direction, amount_satang, currency,
      amount_base_satang, method, status, note, received_by
    )
    select v_hotel_id, p_booking_id, 'refund', v_refund, b.currency,
           v_refund, 'other', 'pending', 'คืนเงิน No-show ตามนโยบาย', auth.uid()
      from public.bookings b where b.id = p_booking_id;
  end if;

  perform public.log_audit(
    v_hotel_id, 'booking.no_show', 'booking', p_booking_id,
    jsonb_build_object('status', v_status),
    jsonb_build_object('status', 'no_show', 'forfeit_satang', v_paid - v_refund,
                       'refund_satang', v_refund), p_reason
  );

  return jsonb_build_object('refund_satang', v_refund,
                            'forfeit_satang', v_paid - v_refund);
end;
$$;

grant execute on function public.mark_no_show(uuid,text) to authenticated;
