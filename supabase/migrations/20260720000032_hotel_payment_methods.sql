-- ============================================================================
-- ช่องทางชำระเงินต่อโรงแรม (เจ้าของขอ 2026-07-20)
-- prefill ทุกช่องทางให้ทุกโรงแรม — ไม่ใช้ = ปิด (inactive) ในหน้าตั้งค่า
-- payment modal ฝั่งรับเงินโชว์เฉพาะช่องทางที่เปิด (การ์ดแบบ POS)
-- ============================================================================

create table public.hotel_payment_methods (
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  method payment_method not null,
  active boolean not null default true,
  sort_order int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (hotel_id, method)
);

alter table public.hotel_payment_methods enable row level security;

-- policy triplet (rules #3): member-select · เขียน = settings.properties (ตั้งค่าโรงแรม)
create policy hotel_payment_methods_select on public.hotel_payment_methods
  for select to authenticated
  using (public.user_role_in_hotel(hotel_id) is not null or public.is_super_admin());
create policy hotel_payment_methods_write on public.hotel_payment_methods
  for all to authenticated
  using (public.user_can(hotel_id, 'settings.properties') or public.is_super_admin())
  with check (public.user_can(hotel_id, 'settings.properties') or public.is_super_admin());

-- ── seed ครบทุกช่องทาง — default: ช่องทางหน้าเคาน์เตอร์เปิด · gateway ออนไลน์
-- (Beam: card_online/wechat/alipay) ปิดจนกว่าจะตั้งค่า Phase 2 ─────────────────
create or replace function public.seed_hotel_payment_methods(p_hotel_id uuid)
returns void language sql security definer set search_path = public as $$
  insert into public.hotel_payment_methods (hotel_id, method, active, sort_order) values
    (p_hotel_id, 'cash',          true,  1),
    (p_hotel_id, 'promptpay_qr',  true,  2),
    (p_hotel_id, 'bank_transfer', true,  3),
    (p_hotel_id, 'card_terminal', true,  4),
    (p_hotel_id, 'ota_collect',   true,  5),
    (p_hotel_id, 'card_online',   false, 6),
    (p_hotel_id, 'wechat_pay',    false, 7),
    (p_hotel_id, 'alipay',        false, 8),
    (p_hotel_id, 'other',         true,  9)
  on conflict (hotel_id, method) do nothing;
$$;

-- โรงแรมใหม่ → seed อัตโนมัติ (pattern เดียวกับ default_property)
create or replace function public.hotels_seed_payment_methods()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.seed_hotel_payment_methods(new.id);
  return new;
end;
$$;
create trigger hotels_seed_payment_methods
  after insert on public.hotels
  for each row execute function public.hotels_seed_payment_methods();

-- backfill โรงแรมที่มีอยู่แล้ว
select public.seed_hotel_payment_methods(id) from public.hotels;
