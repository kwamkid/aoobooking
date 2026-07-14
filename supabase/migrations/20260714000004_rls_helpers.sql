-- ============================================================================
-- RLS helper functions (SECURITY DEFINER กัน RLS recursion) — ยืมจาก aoosocial
-- ทุก policy เรียก helper เหล่านี้ ไม่เทียบ enum ตรงๆ
-- ============================================================================

-- role ของ caller ใน hotel (null = ไม่ใช่สมาชิก)
create or replace function public.user_role_in_hotel(p_hotel_id uuid)
returns hotel_role
language sql stable security definer set search_path = public
as $$
  select role from public.hotel_members
   where user_id = auth.uid() and hotel_id = p_hotel_id
   limit 1;
$$;

-- super admin?
create or replace function public.is_super_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select is_super_admin from public.profiles where id = auth.uid()),
    false
  );
$$;

-- จัดการ hotel ได้ (owner/admin)
create or replace function public.can_manage_hotel(p_hotel_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.user_role_in_hotel(p_hotel_id) in ('owner','admin');
$$;

-- แก้ไขข้อมูลใน hotel ได้ (owner/admin/manager/front_desk)
create or replace function public.can_edit_hotel(p_hotel_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.user_role_in_hotel(p_hotel_id)
         in ('owner','admin','manager','front_desk');
$$;

-- ตรวจ permission ราย module.action (BLUEPRINT §15.3)
-- owner = สิทธิ์เต็มเสมอ · อื่นๆ = COALESCE(override, preset)
create or replace function public.user_can(p_hotel_id uuid, p_permission text)
returns boolean
language plpgsql stable security definer set search_path = public
as $$
declare
  v_role hotel_role;
  v_allowed boolean;
begin
  v_role := public.user_role_in_hotel(p_hotel_id);
  if v_role is null then
    return public.is_super_admin();   -- ไม่ใช่สมาชิก แต่ superadmin ผ่านได้
  end if;
  if v_role = 'owner' then
    return true;                      -- owner สิทธิ์เต็ม ล็อกไว้
  end if;

  -- override รายโรงแรมก่อน
  select allowed into v_allowed
    from public.role_permissions
   where hotel_id = p_hotel_id and role = v_role and permission = p_permission;
  if found then
    return v_allowed;
  end if;

  -- ไม่มี override → preset default
  select allowed into v_allowed
    from public.role_permission_presets
   where role = v_role and permission = p_permission;

  return coalesce(v_allowed, false);
end;
$$;
