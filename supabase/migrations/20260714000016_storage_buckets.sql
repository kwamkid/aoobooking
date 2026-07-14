-- ============================================================================
-- Storage buckets + policies (BLUEPRINT §21.10 + NOTES §9)
-- path convention: {hotel_id}/{entity_id}/{filename} → policy อิง segment แรก
-- ============================================================================

insert into storage.buckets (id, name, public)
values
  ('room-photos', 'room-photos', true),          -- รูปห้อง (booking engine)
  ('payment-slips', 'payment-slips', false),     -- สลิปโอน (signed URL)
  ('guest-ids', 'guest-ids', false),             -- บัตร/passport (PDPA)
  ('housekeeping-photos', 'housekeeping-photos', false)
on conflict (id) do nothing;

-- helper: hotel_id จาก path segment แรก
create or replace function public.storage_hotel_id(p_name text)
returns uuid
language sql stable
as $$
  select nullif((storage.foldername(p_name))[1], '')::uuid;
$$;

-- ── room-photos: อ่านสาธารณะ (bucket public แล้ว) · เขียน = rooms.edit ────────
create policy room_photos_write on storage.objects for all to authenticated
  using (
    bucket_id = 'room-photos'
    and public.user_can(public.storage_hotel_id(name), 'rooms.edit')
  )
  with check (
    bucket_id = 'room-photos'
    and public.user_can(public.storage_hotel_id(name), 'rooms.edit')
  );

-- ── payment-slips: อ่าน/เขียน = member ของ hotel ──────────────────────────────
create policy payment_slips_rw on storage.objects for all to authenticated
  using (
    bucket_id = 'payment-slips'
    and public.user_role_in_hotel(public.storage_hotel_id(name)) is not null
  )
  with check (
    bucket_id = 'payment-slips'
    and public.user_role_in_hotel(public.storage_hotel_id(name)) is not null
  );

-- ── guest-ids: อ่าน = guests.view_id · เขียน = guests.edit (PDPA — จำกัดสิทธิ์) ─
create policy guest_ids_read on storage.objects for select to authenticated
  using (
    bucket_id = 'guest-ids'
    and public.user_can(public.storage_hotel_id(name), 'guests.view_id')
  );
create policy guest_ids_write on storage.objects for insert to authenticated
  with check (
    bucket_id = 'guest-ids'
    and public.user_can(public.storage_hotel_id(name), 'guests.edit')
  );
create policy guest_ids_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'guest-ids'
    and public.user_can(public.storage_hotel_id(name), 'guests.edit')
  );

-- ── housekeeping-photos: เขียน = housekeeping.update · อ่าน = member ─────────
create policy hk_photos_read on storage.objects for select to authenticated
  using (
    bucket_id = 'housekeeping-photos'
    and public.user_role_in_hotel(public.storage_hotel_id(name)) is not null
  );
create policy hk_photos_write on storage.objects for insert to authenticated
  with check (
    bucket_id = 'housekeeping-photos'
    and public.user_can(public.storage_hotel_id(name), 'housekeeping.update')
  );
