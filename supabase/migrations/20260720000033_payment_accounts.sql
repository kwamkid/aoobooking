-- ============================================================================
-- บัญชีรับเงินต่อช่องทาง (เจ้าของขอ 2026-07-20)
-- PromptPay (ขึ้น QR ในระบบ) / บัญชีธนาคาร (หลายบัญชี) / เครื่องรูดบัตร (ตั้งชื่อ
-- + หลายเครื่อง) — payments จดว่าเงินเข้าบัญชี/เครื่องไหน (account_id)
-- Phase 2 booking engine (§21.3 property_payment_configs) ต่อยอดจากตารางนี้ได้
-- ============================================================================

create table public.hotel_payment_accounts (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  method payment_method not null
    check (method in ('promptpay_qr', 'bank_transfer', 'card_terminal')),
  name text not null,          -- ชื่อที่พนักงานเห็น เช่น "KBank สาขาหลัก" / "เครื่องรูด เคาน์เตอร์ 1"
  -- รายละเอียดต่อช่องทาง:
  --  promptpay_qr : {"id_type":"phone"|"citizen_id", "id_value":"0812345678"}
  --  bank_transfer: {"bank":"KBANK", "account_number":"123-4-56789-0", "account_name":"..."}
  --  card_terminal: {} (ชื่ออย่างเดียวพอ)
  details jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index hotel_payment_accounts_hotel_idx
  on public.hotel_payment_accounts (hotel_id, method, sort_order);

alter table public.hotel_payment_accounts enable row level security;
create policy hotel_payment_accounts_select on public.hotel_payment_accounts
  for select to authenticated
  using (public.user_role_in_hotel(hotel_id) is not null or public.is_super_admin());
create policy hotel_payment_accounts_write on public.hotel_payment_accounts
  for all to authenticated
  using (public.user_can(hotel_id, 'settings.properties') or public.is_super_admin())
  with check (public.user_can(hotel_id, 'settings.properties') or public.is_super_admin());

-- ── payments จดปลายทางเงินเข้า (ลบบัญชี → ledger ยังอยู่ แค่ set null) ────────
alter table public.payments
  add column if not exists account_id uuid
    references public.hotel_payment_accounts(id) on delete set null;

-- ── record_payment v2: รับ p_account_id (optional) ──────────────────────────
-- signature เปลี่ยน → drop ตัวเก่าก่อน (create or replace จะกลายเป็น overload)
drop function if exists public.record_payment(uuid, bigint, payment_method, text, text);

create or replace function public.record_payment(
  p_booking_id uuid,
  p_amount_satang bigint,
  p_method payment_method,
  p_slip_path text default null,
  p_note text default null,
  p_account_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_hotel_id uuid;
  v_currency char(3);
  v_status payment_status;
  v_payment_id uuid;
  v_account_name text;
begin
  select hotel_id, currency into v_hotel_id, v_currency
    from public.bookings where id = p_booking_id;
  if v_hotel_id is null then raise exception 'ไม่พบการจอง'; end if;

  if not (public.user_can(v_hotel_id, 'payments.charge') or public.is_super_admin()) then
    raise exception 'ไม่มีสิทธิ์รับชำระเงิน' using errcode = '42501';
  end if;
  if p_amount_satang <= 0 then raise exception 'จำนวนเงินต้องมากกว่า 0'; end if;

  -- บัญชีที่เลือกต้องเป็นของโรงแรมเดียวกัน + ช่องทางตรงกัน (กันยิงข้าม tenant)
  if p_account_id is not null then
    select name into v_account_name
      from public.hotel_payment_accounts
     where id = p_account_id and hotel_id = v_hotel_id and method = p_method;
    if v_account_name is null then
      raise exception 'บัญชีรับเงินไม่ถูกต้อง';
    end if;
  end if;

  -- โอน = รอ verify · อื่นๆ (เงินสด/รูดบัตร/QR) = confirmed ทันที
  v_status := case when p_method = 'bank_transfer' then 'pending'::payment_status
                   else 'confirmed'::payment_status end;

  insert into public.payments (
    hotel_id, booking_id, direction, amount_satang, currency,
    amount_base_satang, method, status, slip_path, note, account_id,
    received_by, confirmed_at, confirmed_by
  ) values (
    v_hotel_id, p_booking_id, 'charge', p_amount_satang, v_currency,
    p_amount_satang, p_method, v_status, p_slip_path, p_note, p_account_id,
    auth.uid(),
    case when v_status = 'confirmed' then now() else null end,
    case when v_status = 'confirmed' then auth.uid() else null end
  ) returning id into v_payment_id;

  perform public.log_audit(
    v_hotel_id, 'payment.recorded', 'payment', v_payment_id,
    null, jsonb_build_object('amount_satang', p_amount_satang, 'method', p_method,
                             'status', v_status, 'account', v_account_name), p_note
  );
  return v_payment_id;
end;
$$;

grant execute on function public.record_payment(uuid,bigint,payment_method,text,text,uuid)
  to authenticated;
