-- ============================================================================
-- Refund UI (BLUEPRINT §14.7: บันทึกในระบบ + คืนจริงนอกระบบ) — devplan ข้อ 5
-- 2 ทาง:
--  · refund_payment  — กดคืนจากแถว charge ใน payment modal (NOTES §6: ต้องมี
--    reference_payment_id ชี้ก้อนที่คืน + ยอดคืนรวมห้ามเกินก้อนนั้น) — สถานะ
--    confirmed ทันที เพราะเงินคืนจริงเกิดนอกระบบแล้วค่อยมาบันทึก
--    ปลดล็อกเคสชำระเกิน: คืนส่วนเกิน → balance = 0 → เช็คเอาท์ผ่าน
--  · confirm_refund  — refund pending ที่ระบบสร้างอัตโนมัติตอน cancel/no-show
--    "ไม่มีที่ไปต่อ" → ยืนยันว่าคืนจริงแล้ว + บันทึกวิธี/บัญชีที่คืน
-- สิทธิ์ payments.refund (แยกจาก bookings.cancel — front_desk ปิด default)
-- ไม่คืนแล้ว (ตกลงกับแขกได้) → void_payment ตัว refund pending ได้อยู่แล้ว
-- ============================================================================

-- ── refund_payment: คืนเงินอ้างอิง charge ก้อนที่รับมา ───────────────────────
create or replace function public.refund_payment(
  p_payment_id uuid,           -- charge ที่จะคืน (reference)
  p_amount_satang bigint,
  p_method payment_method,     -- วิธีคืนจริง (เงินสด/โอน/...)
  p_account_id uuid default null,
  p_note text default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_hotel_id uuid;
  v_booking_id uuid;
  v_direction payment_direction;
  v_status payment_status;
  v_amount bigint;
  v_currency char(3);
  v_refunded bigint;
  v_account_name text;
  v_refund_id uuid;
begin
  -- lock แถว charge — กันกดคืนพร้อมกันสองคนแล้วยอดรวมทะลุ
  select hotel_id, booking_id, direction, status, amount_satang, currency
    into v_hotel_id, v_booking_id, v_direction, v_status, v_amount, v_currency
    from public.payments where id = p_payment_id for update;
  if v_hotel_id is null then raise exception 'ไม่พบรายการชำระ'; end if;

  if not (public.user_can(v_hotel_id, 'payments.refund') or public.is_super_admin()) then
    raise exception 'ไม่มีสิทธิ์คืนเงิน' using errcode = '42501';
  end if;
  if v_direction <> 'charge' or v_status <> 'confirmed' then
    raise exception 'คืนได้เฉพาะรายการรับเงินที่สำเร็จแล้ว';
  end if;
  if p_amount_satang <= 0 then raise exception 'จำนวนเงินต้องมากกว่า 0'; end if;

  -- ยอดคืนรวม (pending+confirmed ที่ชี้ก้อนนี้) ห้ามเกินยอดรับ (NOTES §6)
  select coalesce(sum(amount_satang), 0) into v_refunded
    from public.payments
   where reference_payment_id = p_payment_id
     and direction = 'refund' and status in ('pending', 'confirmed');
  if v_refunded + p_amount_satang > v_amount then
    raise exception 'ยอดคืนรวมเกินยอดรับของรายการนี้ (คืนได้อีกไม่เกิน % สตางค์)',
      v_amount - v_refunded;
  end if;

  -- บัญชีที่คืนต้องเป็นของโรงแรมเดียวกัน + ช่องทางตรงกัน (กันยิงข้าม tenant)
  if p_account_id is not null then
    select name into v_account_name
      from public.hotel_payment_accounts
     where id = p_account_id and hotel_id = v_hotel_id and method = p_method;
    if v_account_name is null then
      raise exception 'บัญชีรับเงินไม่ถูกต้อง';
    end if;
  end if;

  insert into public.payments (
    hotel_id, booking_id, direction, amount_satang, currency,
    amount_base_satang, method, status, note, account_id,
    reference_payment_id, received_by, confirmed_at, confirmed_by
  ) values (
    v_hotel_id, v_booking_id, 'refund', p_amount_satang, v_currency,
    p_amount_satang, p_method, 'confirmed', p_note, p_account_id,
    p_payment_id, auth.uid(), now(), auth.uid()
  ) returning id into v_refund_id;

  perform public.log_audit(
    v_hotel_id, 'payment.refunded', 'payment', v_refund_id,
    null,
    jsonb_build_object('amount_satang', p_amount_satang, 'method', p_method,
                       'reference_payment_id', p_payment_id,
                       'account', v_account_name), p_note
  );
  return v_refund_id;
end;
$$;

-- ── confirm_refund: ยืนยันคืนจริงของ refund pending (จาก cancel/no-show) ─────
create or replace function public.confirm_refund(
  p_payment_id uuid,           -- refund pending
  p_method payment_method,     -- วิธีที่คืนจริง
  p_account_id uuid default null,
  p_note text default null
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_hotel_id uuid;
  v_direction payment_direction;
  v_status payment_status;
  v_amount bigint;
  v_account_name text;
begin
  select hotel_id, direction, status, amount_satang
    into v_hotel_id, v_direction, v_status, v_amount
    from public.payments where id = p_payment_id for update;
  if v_hotel_id is null then raise exception 'ไม่พบรายการชำระ'; end if;

  if not (public.user_can(v_hotel_id, 'payments.refund') or public.is_super_admin()) then
    raise exception 'ไม่มีสิทธิ์คืนเงิน' using errcode = '42501';
  end if;
  if v_direction <> 'refund' or v_status <> 'pending' then
    raise exception 'ยืนยันได้เฉพาะรายการคืนเงินที่รอดำเนินการ';
  end if;

  if p_account_id is not null then
    select name into v_account_name
      from public.hotel_payment_accounts
     where id = p_account_id and hotel_id = v_hotel_id and method = p_method;
    if v_account_name is null then
      raise exception 'บัญชีรับเงินไม่ถูกต้อง';
    end if;
  end if;

  update public.payments
     set method = p_method,
         account_id = p_account_id,
         status = 'confirmed',
         confirmed_at = now(),
         confirmed_by = auth.uid(),
         -- เก็บ note เดิม ("คืนเงินยกเลิก (x วัน...)") ต่อท้ายด้วยหมายเหตุใหม่
         note = case when coalesce(trim(p_note), '') <> ''
                     then coalesce(note || ' · ', '') || trim(p_note)
                     else note end
   where id = p_payment_id;

  perform public.log_audit(
    v_hotel_id, 'payment.refund_confirmed', 'payment', p_payment_id,
    jsonb_build_object('status', 'pending'),
    jsonb_build_object('status', 'confirmed', 'amount_satang', v_amount,
                       'method', p_method, 'account', v_account_name), p_note
  );
end;
$$;

grant execute on function public.refund_payment(uuid,bigint,payment_method,uuid,text) to authenticated;
grant execute on function public.confirm_refund(uuid,payment_method,uuid,text) to authenticated;
