-- ============================================================================
-- FIX: cancel_booking คืน inventory ผิดสำหรับจองหลายห้อง (เจอจากเทส per-room)
-- เดิม: update inv set booked = booked-1 from booking_rooms ... — Postgres
-- UPDATE..FROM อัปเดตแถวเป้าหมาย "ครั้งเดียว" แม้ join เจอหลายแถว → จอง 2 ห้อง
-- ยกเลิกแล้วคืนแค่ 1 (booked ค้าง = ห้องหายจากการขายถาวร)
-- แก้: group นับจำนวนห้องต่อ (type, ช่วงวัน) แล้วลบทีเดียว
-- ============================================================================

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

  -- คืน inventory: นับห้องต่อ (type, ช่วงวัน) แล้วลบทีเดียว (fix multi-room)
  update public.room_type_inventory inv
     set booked = greatest(inv.booked - sub.cnt, 0), updated_at = now()
    from (
      select room_type_id, start_date, end_date, count(*)::int as cnt
        from public.booking_rooms
       where booking_id = p_booking_id
       group by room_type_id, start_date, end_date
    ) sub
   where inv.room_type_id = sub.room_type_id
     and inv.date >= sub.start_date and inv.date < sub.end_date;

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
