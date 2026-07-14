-- ============================================================================
-- RLS policies — policy triplet: member-select / capability-write / super-admin-bypass
-- ============================================================================

-- ---------- profiles ----------
create policy profiles_select_self on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_super_admin());

create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid())
  -- กัน self-escalate is_super_admin (ต้องคงค่าเดิม)
  with check (id = auth.uid() and is_super_admin = (
    select p.is_super_admin from public.profiles p where p.id = auth.uid()
  ));

-- ---------- hotels ----------
-- owner_id = auth.uid() จำเป็น: ตอน insert..returning trigger membership ยังไม่ทันมองเห็น
create policy hotels_select_members on public.hotels for select to authenticated
  using (
    owner_id = auth.uid()
    or public.user_role_in_hotel(id) is not null
    or public.is_super_admin()
  );

create policy hotels_insert_owner on public.hotels for insert to authenticated
  with check (owner_id = auth.uid());   -- สร้างได้ต้องเป็น owner ตัวเอง

create policy hotels_update_managers on public.hotels for update to authenticated
  using (public.can_manage_hotel(id) or public.is_super_admin());

-- ---------- hotel_members ----------
create policy members_select on public.hotel_members for select to authenticated
  using (public.user_role_in_hotel(hotel_id) is not null or public.is_super_admin());

create policy members_write_managers on public.hotel_members for all to authenticated
  using (public.can_manage_hotel(hotel_id) or public.is_super_admin())
  with check (public.can_manage_hotel(hotel_id) or public.is_super_admin());

-- ---------- packages (global reference, อ่านได้ทุก authenticated) ----------
create policy packages_select_all on public.packages for select to authenticated
  using (true);
create policy packages_write_super on public.packages for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- ---------- hotel_package_overrides (superadmin only write) ----------
create policy overrides_select on public.hotel_package_overrides for select to authenticated
  using (public.user_role_in_hotel(hotel_id) is not null or public.is_super_admin());
create policy overrides_write_super on public.hotel_package_overrides for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- ---------- role_permission_presets (global read) ----------
create policy presets_select_all on public.role_permission_presets for select to authenticated
  using (true);
create policy presets_write_super on public.role_permission_presets for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- ---------- role_permissions (per-hotel, จัดการโดย manager+) ----------
create policy role_perms_select on public.role_permissions for select to authenticated
  using (public.user_role_in_hotel(hotel_id) is not null or public.is_super_admin());
create policy role_perms_write on public.role_permissions for all to authenticated
  using (public.can_manage_hotel(hotel_id) or public.is_super_admin())
  with check (public.can_manage_hotel(hotel_id) or public.is_super_admin());
