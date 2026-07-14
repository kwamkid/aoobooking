# AooBooking

Hotel Booking SaaS — multi-tenant PMS (หลังบ้าน) + Booking Engine (จองตรง) + Channel Manager (OTA) รองรับหลายสาขาต่อโรงแรม

## Stack

Next.js 16 (App Router) · React 19 · Supabase (Postgres + Auth + Storage, RLS-first) · Tailwind CSS v4 · next-intl (ไทย+อังกฤษ) · pnpm

## Prerequisites

- Node.js 20+ (แนะนำ 22)
- pnpm 10+
- Supabase CLI (`brew install supabase/tap/supabase`)
- Supabase project (สำหรับ auth + DB)

## Setup

```bash
pnpm install
cp .env.local.example .env.local   # แล้วใส่ค่า Supabase จริง
pnpm db:push                        # apply migrations
pnpm db:types                       # generate src/types/database.ts
pnpm dev                            # http://localhost:3000
```

ตั้ง Google OAuth ใน Supabase Auth และตั้ง `is_super_admin=true` ให้ user ตัวเองผ่าน SQL editor เพื่อเข้า `/super-admin`

## Docs

- **[CLAUDE.md](CLAUDE.md)** — architecture / conventions / start-here (สำหรับ contributor + Claude)
- **[docs/BLUEPRINT.md](docs/BLUEPRINT.md)** — เอกสารออกแบบเต็ม §1–20
- `memo/` — working docs (git-ignored)

## Roadmap

Phase 0 Foundation → 1 PMS Core → 2 Ops (night audit/housekeeping) → 3 Booking Engine → 4 Channel Manager (OTA) → 5 Advanced
