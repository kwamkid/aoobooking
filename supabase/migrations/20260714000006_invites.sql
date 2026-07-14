-- ============================================================================
-- Invites — link ใช้ครั้งเดียว, สร้างได้เรื่อยๆ (BLUEPRINT §15.5) — ยืมจาก aoosocial
-- token = randomBytes(32).base64url (สร้างฝั่ง app) · owner เชิญไม่ได้
-- ============================================================================

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  token text not null unique,
  role hotel_role not null default 'front_desk',
  invited_by uuid not null references public.profiles(id),
  max_uses int not null default 1,          -- ใช้ครั้งเดียว
  used_count int not null default 0,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  constraint invites_token_len check (char_length(token) >= 32),
  constraint invites_no_owner check (role <> 'owner')   -- owner เชิญผ่าน link ไม่ได้
);
create index invites_hotel_idx on public.invites(hotel_id);

alter table public.invites enable row level security;

create policy invites_select on public.invites for select to authenticated
  using (public.can_manage_hotel(hotel_id) or public.is_super_admin());
create policy invites_write on public.invites for all to authenticated
  using (public.can_manage_hotel(hotel_id) or public.is_super_admin())
  with check (public.can_manage_hotel(hotel_id) or public.is_super_admin());

-- accept invite แบบ atomic (FOR UPDATE lock + used_count < max_uses)
create or replace function public.accept_invite(p_token text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_invite public.invites%rowtype;
begin
  select * into v_invite from public.invites
   where token = p_token
   for update;

  if not found then raise exception 'invite_not_found'; end if;
  if v_invite.expires_at is not null and v_invite.expires_at < now() then
    raise exception 'invite_expired';
  end if;
  if v_invite.used_count >= v_invite.max_uses then
    raise exception 'invite_used_up';
  end if;

  insert into public.hotel_members (hotel_id, user_id, role, invited_by)
  values (v_invite.hotel_id, auth.uid(), v_invite.role, v_invite.invited_by)
  on conflict (hotel_id, user_id) do nothing;

  update public.invites set used_count = used_count + 1 where id = v_invite.id;

  return v_invite.hotel_id;
end;
$$;
