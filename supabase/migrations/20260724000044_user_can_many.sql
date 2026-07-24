-- ============================================================================
-- user_can_many — เช็คหลาย permission ในรอบเดียว (ลดโหลดต่อหน้า 2026-07-24)
-- เดิมหน้า detail เรียก user_can 13 ครั้ง = 13 HTTP call ไป PostgREST ต่อการ
-- โหลดหนึ่งหน้า → รวมเป็น call เดียว คืน map {permission: allowed}
-- ตรรกะสิทธิ์อยู่ที่ user_can เดิมตัวเดียว (ไม่ก๊อปสูตร — แก้ที่เดียวมีผลทั้งคู่)
-- ============================================================================

create or replace function public.user_can_many(
  p_hotel_id uuid,
  p_permissions text[]
) returns jsonb
language sql stable security definer set search_path = public
as $$
  select coalesce(
    jsonb_object_agg(p, public.user_can(p_hotel_id, p)),
    '{}'::jsonb
  )
  from unnest(p_permissions) as p;
$$;

grant execute on function public.user_can_many(uuid,text[]) to authenticated;
