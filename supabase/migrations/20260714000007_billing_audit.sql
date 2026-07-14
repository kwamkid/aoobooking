-- ============================================================================
-- SaaS Billing (Beam/PromptPay ตาม aoosocial) + Audit Log (BLUEPRINT §21.9)
--
-- Model: 1 subscription ต่อ hotel · Beam = one-time charge (ไม่มี recurring)
-- → renewal manual: cron ย้าย expired → grace → downgrade เป็น Free
-- hotels.package_id = runtime source of truth ของ entitlements (ทั้งแอปอ่านตัวนี้)
-- webhook/cron เปลี่ยนผ่าน apply_package_change() เท่านั้น (atomic + log เสมอ)
--
-- RLS: member อ่าน billing ของ hotel ตัวเองได้ · เขียน = service-role เท่านั้น
-- (ไม่มี authenticated write policy โดยตั้งใจ) + superadmin bypass
-- ============================================================================

-- ── enums ──────────────────────────────────────────────────────────────────
create type billing_cycle as enum ('monthly', 'yearly');
create type subscription_status as enum ('active', 'grace', 'expired', 'canceled');
create type invoice_status as enum ('pending', 'paid', 'failed', 'expired', 'void');
create type saas_payment_method as enum ('card', 'qr_promptpay', 'manual');

-- ── audit_logs (ใช้ทั้งระบบ ไม่ใช่แค่ billing) ────────────────────────────
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid references public.hotels(id) on delete cascade,  -- null = ระดับ platform
  actor_id uuid references public.profiles(id),                  -- null = system/cron
  action text not null,               -- 'package.upgraded' / 'invoice.paid' / 'booking.cancelled' ...
  entity_type text,                   -- 'subscription' / 'invoice' / 'booking' ...
  entity_id uuid,
  old_data jsonb,
  new_data jsonb,
  note text,
  created_at timestamptz not null default now()
);
create index audit_logs_hotel_idx on public.audit_logs (hotel_id, created_at desc);
create index audit_logs_action_idx on public.audit_logs (action, created_at desc);
alter table public.audit_logs enable row level security;

-- helper เขียน log จาก function อื่น/server action (SECURITY DEFINER)
create or replace function public.log_audit(
  p_hotel_id uuid, p_action text, p_entity_type text, p_entity_id uuid,
  p_old jsonb default null, p_new jsonb default null, p_note text default null
) returns void
language sql security definer set search_path = public
as $$
  insert into public.audit_logs
    (hotel_id, actor_id, action, entity_type, entity_id, old_data, new_data, note)
  values
    (p_hotel_id, auth.uid(), p_action, p_entity_type, p_entity_id, p_old, p_new, p_note);
$$;

-- อ่าน: owner/admin ของ hotel + superadmin · เขียน: ผ่าน log_audit()/service-role เท่านั้น
create policy audit_select on public.audit_logs for select to authenticated
  using (
    (hotel_id is not null and public.can_manage_hotel(hotel_id))
    or public.is_super_admin()
  );

-- ── subscriptions (1 ต่อ hotel — hotel ที่เป็น Free ไม่มี row) ─────────────
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null unique references public.hotels(id) on delete cascade,
  package_id uuid not null references public.packages(id),
  billing_cycle billing_cycle not null default 'monthly',
  status subscription_status not null default 'active',
  current_period_end timestamptz not null,   -- หมดช่วงที่จ่ายแล้ว → เข้า grace
  grace_until timestamptz,                   -- เกินนี้แล้วยังไม่จ่าย → downgrade Free
  -- downgrade แบบนัดล่วงหน้า (มีผลตอนจบรอบ)
  scheduled_package_id uuid references public.packages(id),
  scheduled_cycle billing_cycle,
  last_reminder_day int,
  started_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index subscriptions_status_period_idx
  on public.subscriptions (status, current_period_end);
alter table public.subscriptions enable row level security;

create policy subscriptions_select on public.subscriptions for select to authenticated
  using (public.user_role_in_hotel(hotel_id) is not null or public.is_super_admin());
create policy subscriptions_write_super on public.subscriptions for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- ── invoices (1 row ต่อ 1 ครั้งที่เรียกเก็บ — referenceId ที่ส่งให้ Beam = id) ──
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  package_id uuid not null references public.packages(id),
  billing_cycle billing_cycle not null,
  amount_satang bigint not null check (amount_satang >= 0),
  vat_satang bigint not null default 0,      -- VAT 7% (แตกยอดไว้เพื่อใบกำกับภาษี)
  currency char(3) not null default 'THB',
  payment_method saas_payment_method not null,
  status invoice_status not null default 'pending',
  beam_charge_id text,
  qr_expiry timestamptz,
  paid_at timestamptz,
  created_by uuid references public.profiles(id),
  raw jsonb,                                 -- Beam response/webhook payload (debug+audit)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index invoices_hotel_idx on public.invoices (hotel_id, created_at desc);
create index invoices_beam_charge_idx on public.invoices (beam_charge_id);
create index invoices_status_idx on public.invoices (status);
alter table public.invoices enable row level security;

create policy invoices_select on public.invoices for select to authenticated
  using (public.user_role_in_hotel(hotel_id) is not null or public.is_super_admin());
create policy invoices_write_super on public.invoices for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- ── check_package_fits: ดาวน์เกรดได้ไหม (usage ปัจจุบัน vs limit ใหม่) ──────
-- Phase 0 เช็คได้แค่ team members — Phase 1 ต้องเพิ่ม properties/rooms count!
create or replace function public.check_package_fits(p_hotel_id uuid, p_package_id uuid)
returns text[]
language plpgsql stable security definer set search_path = public
as $$
declare
  v_pkg public.packages%rowtype;
  v_violations text[] := '{}';
  v_members int;
begin
  select * into v_pkg from public.packages where id = p_package_id;
  if not found then return array['package_not_found']; end if;

  select count(*) into v_members from public.hotel_members where hotel_id = p_hotel_id;
  if v_pkg.max_team_members is not null and v_members > v_pkg.max_team_members then
    v_violations := v_violations
      || format('members:%s>%s', v_members, v_pkg.max_team_members);
  end if;

  -- TODO(Phase 1): เช็ค max_properties / max_rooms / max_ota_channels ที่นี่
  return v_violations;
end;
$$;

-- ── apply_package_change: จุดเดียวที่เปลี่ยนแพ็กเกจ (atomic + log เสมอ) ─────
-- เรียกจาก webhook (จ่ายสำเร็จ) / cron (downgrade) / superadmin / dev-mode
create or replace function public.apply_package_change(
  p_hotel_id uuid,
  p_package_id uuid,
  p_reason text                    -- 'upgrade_paid' / 'scheduled_downgrade' / 'grace_expired' / 'superadmin' / 'dev'
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_old uuid;
begin
  select package_id into v_old from public.hotels where id = p_hotel_id for update;

  update public.hotels
     set package_id = p_package_id, updated_at = now()
   where id = p_hotel_id;

  perform public.log_audit(
    p_hotel_id, 'package.changed', 'hotel', p_hotel_id,
    jsonb_build_object('package_id', v_old),
    jsonb_build_object('package_id', p_package_id),
    p_reason
  );
end;
$$;
