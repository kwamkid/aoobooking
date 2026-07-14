-- ============================================================================
-- Booking lifecycle RPCs (BLUEPRINT §14 + NOTES §4.2 state guards, §6 refund)
-- ทุกตัว: security definer + เช็ค user_can() + guard สถานะ + log_audit
-- (create_booking อยู่ 000013 · change_date/move_room จะเพิ่มตอนทำ booking detail เต็ม)
-- ============================================================================

-- ── record_payment: บันทึกการรับเงิน (มัดจำ/จ่ายเพิ่ม/จ่ายครบ) ───────────────
-- cash/card_terminal = confirmed ทันที · bank_transfer = pending (รอ verify slip)
create or replace function public.record_payment(
  p_booking_id uuid,
  p_amount_satang bigint,
  p_method payment_method,
  p_slip_path text default null,
  p_note text default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_hotel_id uuid;
  v_currency char(3);
  v_status payment_status;
  v_payment_id uuid;
begin
  select hotel_id, currency into v_hotel_id, v_currency
    from public.bookings where id = p_booking_id;
  if v_hotel_id is null then raise exception 'ไม่พบการจอง'; end if;

  if not (public.user_can(v_hotel_id, 'payments.charge') or public.is_super_admin()) then
    raise exception 'ไม่มีสิทธิ์รับชำระเงิน' using errcode = '42501';
  end if;
  if p_amount_satang <= 0 then raise exception 'จำนวนเงินต้องมากกว่า 0'; end if;

  -- โอน = รอ verify · อื่นๆ (เงินสด/รูดบัตร/QR) = confirmed ทันที
  v_status := case when p_method = 'bank_transfer' then 'pending'::payment_status
                   else 'confirmed'::payment_status end;

  insert into public.payments (
    hotel_id, booking_id, direction, amount_satang, currency,
    amount_base_satang, method, status, slip_path, note,
    received_by, confirmed_at, confirmed_by
  ) values (
    v_hotel_id, p_booking_id, 'charge', p_amount_satang, v_currency,
    p_amount_satang, p_method, v_status, p_slip_path, p_note,
    auth.uid(),
    case when v_status = 'confirmed' then now() else null end,
    case when v_status = 'confirmed' then auth.uid() else null end
  ) returning id into v_payment_id;

  perform public.log_audit(
    v_hotel_id, 'payment.recorded', 'payment', v_payment_id,
    null, jsonb_build_object('amount_satang', p_amount_satang, 'method', p_method,
                             'status', v_status), p_note
  );
  return v_payment_id;
end;
$$;

-- ── verify_slip_payment: อนุมัติ/ปฏิเสธ สลิปโอน ─────────────────────────────
create or replace function public.verify_slip_payment(
  p_payment_id uuid,
  p_approve boolean
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_hotel_id uuid;
  v_status payment_status;
begin
  select hotel_id, status into v_hotel_id, v_status
    from public.payments where id = p_payment_id;
  if v_hotel_id is null then raise exception 'ไม่พบรายการชำระ'; end if;

  if not (public.user_can(v_hotel_id, 'payments.verify_slip') or public.is_super_admin()) then
    raise exception 'ไม่มีสิทธิ์ยืนยันสลิป' using errcode = '42501';
  end if;
  if v_status <> 'pending' then raise exception 'รายการนี้ไม่ได้รออนุมัติ'; end if;

  update public.payments
     set status = case when p_approve then 'confirmed'::payment_status
                       else 'failed'::payment_status end,
         confirmed_at = case when p_approve then now() else null end,
         confirmed_by = auth.uid()
   where id = p_payment_id;

  perform public.log_audit(
    v_hotel_id, 'payment.slip_verified', 'payment', p_payment_id,
    jsonb_build_object('status', 'pending'),
    jsonb_build_object('approved', p_approve)
  );
end;
$$;

-- ── check_in_booking: guard confirmed → assign room + checked_in ────────────
-- p_room_assignments jsonb: [{booking_room_id, room_id}, ...]
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
     set status = 'checked_in', updated_at = now()
   where id = p_booking_id;

  perform public.log_audit(
    v_hotel_id, 'booking.checked_in', 'booking', p_booking_id,
    jsonb_build_object('status', 'confirmed'),
    jsonb_build_object('status', 'checked_in')
  );
end;
$$;

-- ── check_out_booking: guard checked_in + folio balance = 0 → checked_out ────
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
     set status = 'checked_out', updated_at = now()
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

-- ── cancel_booking: คืน inventory + คำนวณยอดคืนตาม cancellation_policy ────────
create or replace function public.cancel_booking(
  p_booking_id uuid,
  p_reason text default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_hotel_id uuid;
  v_status booking_status;
  v_check_in date;
  v_total bigint;
  v_paid bigint;
  v_policy jsonb;
  v_days_before int;
  v_refund bigint := 0;
  v_refund_pct numeric := 0;
  v_rule jsonb;
begin
  select b.hotel_id, b.status, b.check_in, b.total_satang
    into v_hotel_id, v_status, v_check_in, v_total
    from public.bookings b where b.id = p_booking_id for update;
  if v_hotel_id is null then raise exception 'ไม่พบการจอง'; end if;

  if not (public.user_can(v_hotel_id, 'bookings.cancel') or public.is_super_admin()) then
    raise exception 'ไม่มีสิทธิ์ยกเลิกการจอง' using errcode = '42501';
  end if;
  if v_status in ('cancelled', 'checked_out', 'no_show') then
    raise exception 'การจองนี้ยกเลิกไม่ได้ (สถานะ: %)', v_status;
  end if;

  -- คืน inventory ทุก segment (loop < end_date — off-by-one guard)
  update public.room_type_inventory inv
     set booked = greatest(booked - 1, 0), updated_at = now()
    from public.booking_rooms br
   where br.booking_id = p_booking_id
     and inv.room_type_id = br.room_type_id
     and inv.date >= br.start_date and inv.date < br.end_date;

  -- ยอดจ่ายจริง (confirmed)
  select coalesce(paid_satang, 0) into v_paid
    from public.booking_balances where booking_id = p_booking_id;

  -- คำนวณยอดคืนตาม policy (§14.4) — เทียบวันนี้ vs check_in
  select cancellation_policy into v_policy
    from public.rate_plans rp
    join public.booking_rooms br on br.rate_plan_id = rp.id
   where br.booking_id = p_booking_id limit 1;
  v_days_before := v_check_in - current_date;

  if v_policy->>'type' = 'non_refundable' then
    v_refund := 0;
  elsif v_policy->>'type' = 'free_until' then
    v_refund := case when v_days_before >= (v_policy->>'days_before')::int
                     then v_paid else 0 end;
  elsif v_policy->>'type' = 'tiered' then
    -- หา rule แรกที่ days_before ผ่านเกณฑ์ (rules เรียงจากมากไปน้อย)
    for v_rule in select * from jsonb_array_elements(v_policy->'rules')
    loop
      if v_days_before >= (v_rule->>'days_before')::int then
        v_refund_pct := (v_rule->>'refund_percent')::numeric;
        exit;
      end if;
    end loop;
    v_refund := (v_paid * v_refund_pct / 100)::bigint;
  else
    v_refund := v_paid;  -- ไม่มี policy = คืนเต็ม (ปลอดภัยกับลูกค้า)
  end if;

  update public.bookings
     set status = 'cancelled', cancelled_at = now(), cancel_reason = p_reason,
         updated_at = now()
   where id = p_booking_id;

  -- สร้าง refund record (pending) ถ้ามียอดคืน
  if v_refund > 0 then
    insert into public.payments (
      hotel_id, booking_id, direction, amount_satang, currency,
      amount_base_satang, method, status, note, received_by
    )
    select v_hotel_id, p_booking_id, 'refund', v_refund, b.currency,
           v_refund, 'other', 'pending',
           format('คืนเงินยกเลิก (%s วันก่อนเข้าพัก)', v_days_before), auth.uid()
      from public.bookings b where b.id = p_booking_id;
  end if;

  perform public.log_audit(
    v_hotel_id, 'booking.cancelled', 'booking', p_booking_id,
    jsonb_build_object('status', v_status),
    jsonb_build_object('status', 'cancelled', 'refund_satang', v_refund), p_reason
  );

  return jsonb_build_object('refund_satang', v_refund, 'days_before', v_days_before);
end;
$$;

-- grants (function เช็คสิทธิ์เอง)
grant execute on function public.record_payment(uuid,bigint,payment_method,text,text) to authenticated;
grant execute on function public.verify_slip_payment(uuid,boolean) to authenticated;
grant execute on function public.check_in_booking(uuid,jsonb) to authenticated;
grant execute on function public.check_out_booking(uuid) to authenticated;
grant execute on function public.cancel_booking(uuid,text) to authenticated;
