-- ============================================================================
-- Void payment — บันทึกการชำระผิด → ตีเป็นโมฆะ (rules #12: ledger ห้ามลบ/แก้ทับ)
-- แถวยังอยู่ status='voided' + เหตุผล · ยอด (booking_balances / search_bookings)
-- ไม่นับอยู่แล้วเพราะนับเฉพาะ confirmed · เงินที่ต้องคืนแขกจริง = refund คนละเรื่อง
-- สิทธิ์แยก `payments.void` (front_desk ปิด default เหมือน refund — กันบันทึกรับ
-- เงินสดแล้ว void ทีหลังเพื่อยักยอก) — ต้อง audit ครบทุกครั้ง
-- ============================================================================

-- ── คอลัมน์ void บน ledger ───────────────────────────────────────────────────
alter table public.payments
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references public.profiles(id),
  add column if not exists void_reason text;

-- ── permission ใหม่: payments.void ──────────────────────────────────────────
-- owner สิทธิ์เต็มใน resolver อยู่แล้ว · viewer/housekeeping ไม่มี row = false
insert into public.role_permission_presets (role, permission, allowed) values
  ('admin','payments.void',true),
  ('manager','payments.void',true),
  ('front_desk','payments.void',false)
on conflict (role, permission) do nothing;

-- ── RPC void_payment ─────────────────────────────────────────────────────────
create or replace function public.void_payment(
  p_payment_id uuid,
  p_reason text
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_hotel_id uuid;
  v_status payment_status;
  v_direction payment_direction;
  v_amount bigint;
begin
  select hotel_id, status, direction, amount_satang
    into v_hotel_id, v_status, v_direction, v_amount
    from public.payments where id = p_payment_id for update;
  if v_hotel_id is null then raise exception 'ไม่พบรายการชำระ'; end if;

  if not (public.user_can(v_hotel_id, 'payments.void') or public.is_super_admin()) then
    raise exception 'ไม่มีสิทธิ์ยกเลิกรายการชำระเงิน' using errcode = '42501';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'ต้องระบุเหตุผลที่ยกเลิกรายการ';
  end if;
  -- void ได้เฉพาะรายการที่ยังมีผล (pending รอสลิป / confirmed) — voided/failed จบแล้ว
  if v_status not in ('pending', 'confirmed') then
    raise exception 'รายการนี้ยกเลิกไม่ได้ (สถานะ: %)', v_status;
  end if;
  -- charge ที่มี refund ชี้กลับและยังมีผลอยู่ → ต้องจัดการ refund ก่อน (กัน ledger ขัดกัน)
  if v_direction = 'charge' and exists (
    select 1 from public.payments r
     where r.reference_payment_id = p_payment_id
       and r.direction = 'refund' and r.status in ('pending', 'confirmed')
  ) then
    raise exception 'รายการนี้มีการคืนเงินอ้างอิงอยู่ — ยกเลิกรายการคืนเงินก่อน';
  end if;

  update public.payments
     set status = 'voided',
         voided_at = now(),
         voided_by = auth.uid(),
         void_reason = trim(p_reason)
   where id = p_payment_id;

  perform public.log_audit(
    v_hotel_id, 'payment.voided', 'payment', p_payment_id,
    jsonb_build_object('status', v_status),
    jsonb_build_object('status', 'voided', 'direction', v_direction,
                       'amount_satang', v_amount),
    trim(p_reason)
  );
end;
$$;

grant execute on function public.void_payment(uuid,text) to authenticated;
