-- ============================================================================
-- log_audit: ทำ p_hotel_id ให้ nullable ชัดเจน (default null)
-- platform-level audit (webhook charge.failed ก่อนรู้ hotel) ต้องส่ง null ได้
-- (audit_logs.hotel_id nullable อยู่แล้ว — แค่ทำ signature ให้ gen types ตรง)
-- ============================================================================
create or replace function public.log_audit(
  p_hotel_id uuid default null,
  p_action text default null,
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_old jsonb default null,
  p_new jsonb default null,
  p_note text default null
) returns void
language sql security definer set search_path = public
as $$
  insert into public.audit_logs
    (hotel_id, actor_id, action, entity_type, entity_id, old_data, new_data, note)
  values
    (p_hotel_id, auth.uid(), p_action, p_entity_type, p_entity_id, p_old, p_new, p_note);
$$;
