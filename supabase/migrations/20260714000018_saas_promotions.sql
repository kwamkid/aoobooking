-- ============================================================================
-- SaaS Promotions — "ใช้ฟรี N เดือน" (เจ้าของขอ 2026-07-14)
-- 2 กลไก: (ก) superadmin grant รายโรงแรม  (ข) promo code สมัครเอง
-- ทั้งคู่ = apply package + ตั้ง subscription 'trialing' ถึง now+N เดือน (ไม่สร้าง invoice)
-- พอหมด trial → cron billing ดันเข้า grace เหมือน paid ที่หมดอายุ (บีบให้จ่ายต่อ)
-- ★ คนละตัวกับ promo โรงแรม (§21.8 = ส่วนลดห้องพักหน้า booking engine)
-- ============================================================================

-- เพิ่มสถานะ trialing (ทดลองใช้ฟรี — ยังไม่เก็บเงิน)

-- ── promo_codes (platform-scoped — superadmin สร้าง) ────────────────────────
create table public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,                         -- เช่น FREE3M (uppercase)
  package_id uuid not null references public.packages(id),
  free_months int not null check (free_months >= 1),
  max_uses int,                                      -- null = ไม่จำกัด
  used_count int not null default 0,
  expires_at timestamptz,                            -- null = ไม่หมดอายุ
  is_active boolean not null default true,
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index promo_codes_code_idx on public.promo_codes (upper(code));
alter table public.promo_codes enable row level security;

-- อ่าน: superadmin เท่านั้น (โค้ดไม่ควรหลุด) · เขียน: superadmin
create policy promo_codes_super on public.promo_codes for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- ── ตัวช่วยกลาง: เริ่ม trial ให้ hotel (apply package + subscription trialing) ─
create or replace function public._start_trial(
  p_hotel_id uuid, p_package_id uuid, p_months int, p_reason text
) returns timestamptz
language plpgsql security definer set search_path = public
as $$
declare
  v_end timestamptz := now() + make_interval(months => p_months);
begin
  -- เปลี่ยน package จริง (log package.changed ในตัว)
  perform public.apply_package_change(p_hotel_id, p_package_id, p_reason);

  -- ตั้ง/ต่อ subscription เป็น trialing ถึง now+N เดือน (ไม่มี invoice/ไม่เก็บเงิน)
  insert into public.subscriptions (hotel_id, package_id, status, current_period_end, grace_until)
  values (p_hotel_id, p_package_id, 'trialing', v_end, null)
  on conflict (hotel_id) do update
    set package_id = excluded.package_id,
        status = 'trialing',
        current_period_end = v_end,
        grace_until = null,
        scheduled_package_id = null,
        scheduled_cycle = null,
        updated_at = now();

  return v_end;
end;
$$;

-- ── (ก) grant_promotion: superadmin ให้ฟรีรายโรงแรม ─────────────────────────
create or replace function public.grant_promotion(
  p_hotel_id uuid, p_package_id uuid, p_months int, p_note text default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_end timestamptz;
begin
  if not public.is_super_admin() then
    raise exception 'เฉพาะ superadmin เท่านั้น' using errcode = '42501';
  end if;
  if p_months < 1 then raise exception 'จำนวนเดือนต้อง >= 1'; end if;

  v_end := public._start_trial(p_hotel_id, p_package_id,
             p_months, format('promotion_grant(%s เดือน)', p_months));

  perform public.log_audit(
    p_hotel_id, 'promotion.granted', 'subscription', p_hotel_id,
    null, jsonb_build_object('package_id', p_package_id, 'free_months', p_months,
                             'trial_until', v_end), p_note
  );
  return jsonb_build_object('trial_until', v_end);
end;
$$;

-- ── (ข) redeem_promo_code: โรงแรมกรอกโค้ดเอง ────────────────────────────────
create or replace function public.redeem_promo_code(
  p_hotel_id uuid, p_code text
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_promo public.promo_codes%rowtype;
  v_end timestamptz;
begin
  -- ต้องเป็น owner/admin ของโรงแรมนั้น (หรือ superadmin)
  if not (public.can_manage_hotel(p_hotel_id) or public.is_super_admin()) then
    raise exception 'ไม่มีสิทธิ์ใช้โค้ดโปรโมชัน' using errcode = '42501';
  end if;

  select * into v_promo from public.promo_codes
   where upper(code) = upper(p_code) for update;
  if not found then raise exception 'ไม่พบโค้ดนี้'; end if;
  if not v_promo.is_active then raise exception 'โค้ดนี้ถูกปิดใช้งาน'; end if;
  if v_promo.expires_at is not null and v_promo.expires_at < now() then
    raise exception 'โค้ดนี้หมดอายุแล้ว';
  end if;
  if v_promo.max_uses is not null and v_promo.used_count >= v_promo.max_uses then
    raise exception 'โค้ดนี้ถูกใช้ครบจำนวนแล้ว';
  end if;

  v_end := public._start_trial(p_hotel_id, v_promo.package_id,
             v_promo.free_months, format('promo_code(%s)', v_promo.code));

  update public.promo_codes set used_count = used_count + 1 where id = v_promo.id;

  perform public.log_audit(
    p_hotel_id, 'promotion.redeemed', 'promo_code', v_promo.id,
    null, jsonb_build_object('code', v_promo.code, 'free_months', v_promo.free_months,
                             'trial_until', v_end)
  );
  return jsonb_build_object('trial_until', v_end, 'free_months', v_promo.free_months);
end;
$$;

grant execute on function public.grant_promotion(uuid,uuid,int,text) to authenticated;
grant execute on function public.redeem_promo_code(uuid,text) to authenticated;
-- _start_trial เป็น internal — ไม่ grant ให้ authenticated เรียกตรง
revoke all on function public._start_trial(uuid,uuid,int,text) from authenticated, anon;
