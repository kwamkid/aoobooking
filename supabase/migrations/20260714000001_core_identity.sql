-- ============================================================================
-- Core identity — tenant trio (profiles / hotels / hotel_members)
-- ยืม pattern จาก aoosocial: shared schema + hotel_id column (ไม่ใช่ schema-per-tenant)
-- tenant 2 ระดับ: hotels (แบรนด์) → properties (สาขา) — property อยู่ migration ถัดไป (Phase 1)
-- ============================================================================

-- ---------- roles ----------
create type hotel_role as enum (
  'owner',
  'admin',
  'manager',
  'front_desk',
  'housekeeping',
  'viewer'
);

-- ---------- profiles (1:1 auth.users) ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  locale text not null default 'th',
  is_super_admin boolean not null default false,   -- global admin flag (ตั้งผ่าน SQL เท่านั้น)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- auto สร้าง profile ตอน signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- hotels (TENANT) ----------
create table public.hotels (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,                        -- URL booking engine: /baan-suan
  name text not null,
  owner_id uuid not null references public.profiles(id),
  package_id uuid,                                  -- FK → packages (migration ถัดไป)
  base_currency char(3) not null default 'THB',     -- สกุลบัญชี (ยอดในรายงาน)
  accepted_currencies char(3)[] not null default array['THB'],
  is_active boolean not null default true,
  deleted_at timestamptz,                           -- soft delete
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hotels_slug_format check (slug ~ '^[a-z0-9]([a-z0-9-]{1,48}[a-z0-9])?$')
);
create index hotels_owner_idx on public.hotels(owner_id);

-- ---------- hotel_members (M:N user ↔ hotel + role) ----------
create table public.hotel_members (
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role hotel_role not null default 'front_desk',
  invited_by uuid references public.profiles(id) on delete set null,
  joined_at timestamptz not null default now(),
  primary key (hotel_id, user_id)
);
create index hotel_members_user_idx on public.hotel_members(user_id);

-- auto เพิ่ม owner เป็นสมาชิกตอนสร้าง hotel (atomic — กัน RLS ปัญหาไก่กับไข่:
-- ตอนสร้างเสร็จ user ยังไม่เป็นสมาชิก จึง insert member เองผ่าน RLS ไม่ได้)
create or replace function public.handle_new_hotel()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.hotel_members (hotel_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (hotel_id, user_id) do nothing;
  return new;
end;
$$;

create trigger on_hotel_created
  after insert on public.hotels
  for each row execute function public.handle_new_hotel();

-- enable RLS (policies อยู่ migration rls_policies)
alter table public.profiles enable row level security;
alter table public.hotels enable row level security;
alter table public.hotel_members enable row level security;
