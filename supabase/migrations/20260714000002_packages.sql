-- ============================================================================
-- Packages (plans) + per-hotel overrides
-- limit = คอลัมน์บน plan row · resolver = COALESCE(override, package_default)
-- ยืม pattern จาก aoosocial (packages + company_package_overrides)
-- ============================================================================

create table public.packages (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,                     -- free / starter / pro / business / enterprise
  name text not null,
  description text,

  -- limits (null = unlimited)
  max_properties int,                            -- จำนวนสาขา
  max_rooms int,                                 -- จำนวนห้องรวมทุกสาขา
  max_team_members int,                          -- user seats
  max_ota_channels int,                          -- จำนวน OTA ที่ต่อได้

  -- feature flags
  allow_booking_engine boolean not null default false,
  allow_channel_manager boolean not null default false,
  allow_dynamic_pricing boolean not null default false,
  allow_advanced_reports boolean not null default false,
  allow_custom_domain boolean not null default false,
  remove_branding boolean not null default false,

  price_thb_monthly int,
  price_thb_yearly int,
  is_active boolean not null default true,
  is_public boolean not null default true,       -- false = enterprise (invite-only)
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- FK hotels.package_id → packages
alter table public.hotels
  add constraint hotels_package_fk
  foreign key (package_id) references public.packages(id);

-- per-hotel override (superadmin escape hatch)
create table public.hotel_package_overrides (
  hotel_id uuid primary key references public.hotels(id) on delete cascade,
  max_properties_override int,
  max_rooms_override int,
  max_team_members_override int,
  max_ota_channels_override int,
  allow_booking_engine_override boolean,
  allow_channel_manager_override boolean,
  allow_dynamic_pricing_override boolean,
  allow_advanced_reports_override boolean,
  allow_custom_domain_override boolean,
  remove_branding_override boolean,
  reason text,
  granted_by uuid references public.profiles(id),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.packages enable row level security;
alter table public.hotel_package_overrides enable row level security;

-- seed tiers (BLUEPRINT §5.3)
insert into public.packages
  (slug, name, max_properties, max_rooms, max_team_members, max_ota_channels,
   allow_booking_engine, allow_channel_manager, allow_dynamic_pricing,
   allow_advanced_reports, allow_custom_domain, remove_branding,
   price_thb_monthly, is_public, sort_order)
values
  ('free',       'Free',        1,    5,   2,    0, false, false, false, false, false, false,    0, true, 0),
  ('starter',    'Starter',     1,   15,   5,    0, true,  false, false, false, false, false,  590, true, 1),
  ('pro',        'Pro',         3,   40,  15,    3, true,  true,  false, false, true,  true,  1590, true, 2),
  ('business',   'Business',   10,  100, null, null, true,  true,  true,  true,  true,  true,  3900, true, 3),
  ('enterprise', 'Enterprise', null, null, null, null, true, true, true, true, true, true, null, false, 4);
