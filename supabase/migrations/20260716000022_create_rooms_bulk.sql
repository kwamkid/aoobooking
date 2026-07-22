-- create_rooms_bulk — เพิ่มห้องหลายห้องแบบ atomic ครั้งเดียว (เจ้าของขอ 2026-07-16: "ชอบใช้ rpc ไม่ชอบวนลูปสร้าง")
--
-- ปัญหาของเดิม (app layer ทำ 3 round-trip แยกกัน: เช็คซ้ำ → เช็ค limit → insert):
--   race 1: 2 คนกดเพิ่ม "101-110" พร้อมกัน → เช็คซ้ำผ่านทั้งคู่ → คนหลัง insert ชน unique พังทั้งชุด
--   race 2: assertWithinLimit ผ่านแล้ว แต่มีคนแทรก insert ก่อน → เกิน limit แพ็กเกจได้
-- → ย้ายมาไว้ใน RPC เดียว = ทุกอย่างอยู่ใน transaction เดียว + lock กันแข่ง (rules: เงิน/limit เช็คที่ DB ด้วย)
--
-- หมายเหตุ constraint: rooms_number_unique = (property_id, room_number) โดย "ไม่" กรอง deleted_at
-- → ห้องที่ soft-delete ไปแล้วยังจองเลขห้องอยู่ · RPC นี้จึง "ปลุกคืน" (undelete) แทนที่จะ insert ซ้ำ

-- ── helper: resolve limit ห้องของโรงแรม (COALESCE override, เคารพ expires_at) ──
-- แยกเป็น function เพื่อไม่ให้ COALESCE logic กระจาย (สอดคล้อง resolve-access.ts NOTES §5)
create or replace function public.hotel_max_rooms(p_hotel_id uuid)
returns int
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select o.max_rooms_override
       from public.hotel_package_overrides o
      where o.hotel_id = p_hotel_id
        and (o.expires_at is null or o.expires_at > now())),
    (select p.max_rooms
       from public.hotels h
       join public.packages p on p.id = h.package_id
      where h.id = p_hotel_id)
  );
$$;

comment on function public.hotel_max_rooms is
  'limit ห้องของโรงแรม — COALESCE(override ที่ยังไม่หมดอายุ, package default) · null = unlimited';

-- ── create_rooms_bulk ──
-- p_room_numbers: array เลขห้องที่ parse มาแล้วจาก app (lib/hotel/room-numbers.ts)
-- คืน { added, added_rooms, skipped, restored } — skipped = มีอยู่แล้ว (active) ข้ามไป
create or replace function public.create_rooms_bulk(
  p_hotel_id uuid,
  p_property_id uuid,
  p_room_type_id uuid,
  p_room_numbers text[],
  p_floor text default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_limit int;
  v_current int;
  v_to_add int;
  v_added text[];
  v_restored text[];
  v_skipped text[];
  v_first_id uuid;
begin
  -- ── สิทธิ์ (ชั้น DB — ชั้นที่ 1 ของ 3 ชั้นตาม rules) ──
  if not (public.user_can(p_hotel_id, 'rooms.edit') or public.is_super_admin()) then
    raise exception 'ไม่มีสิทธิ์จัดการห้อง' using errcode = '42501';
  end if;

  if p_room_numbers is null or array_length(p_room_numbers, 1) is null then
    raise exception 'ไม่มีเลขห้อง';
  end if;

  -- property ต้องอยู่ใน hotel นี้จริง (กันยิง RPC ข้าม tenant)
  if not exists (
    select 1 from public.properties
     where id = p_property_id and hotel_id = p_hotel_id and deleted_at is null
  ) then
    raise exception 'ไม่พบสาขา';
  end if;

  -- room_type ต้องอยู่ใน property นี้จริง
  if not exists (
    select 1 from public.room_types
     where id = p_room_type_id and property_id = p_property_id and deleted_at is null
  ) then
    raise exception 'ไม่พบประเภทห้อง';
  end if;

  -- ── lock ระดับโรงแรม กัน 2 request แข่งกันจนเกิน limit/ชน unique ──
  -- (advisory lock — ปล่อยเองตอนจบ transaction)
  perform pg_advisory_xact_lock(hashtextextended(p_hotel_id::text, 0));

  -- ── แยก 3 กลุ่ม: ปลุกคืน (soft-deleted) / ข้าม (active อยู่แล้ว) / เพิ่มใหม่ ──
  select
    coalesce(array_agg(rn) filter (where st = 'restore'), '{}'::text[]),
    coalesce(array_agg(rn) filter (where st = 'skip'), '{}'::text[]),
    coalesce(array_agg(rn) filter (where st = 'new'), '{}'::text[])
  into v_restored, v_skipped, v_added
  from (
    select
      n.rn,
      case
        when r.id is null then 'new'
        when r.deleted_at is not null then 'restore'
        else 'skip'
      end as st
    from unnest(p_room_numbers) as n(rn)
    left join public.rooms r
      on r.property_id = p_property_id and r.room_number = n.rn
  ) t;

  v_to_add := coalesce(array_length(v_added, 1), 0)
            + coalesce(array_length(v_restored, 1), 0);

  if v_to_add = 0 then
    return jsonb_build_object(
      'added', 0, 'added_rooms', '[]'::jsonb, 'restored', 0,
      'skipped', to_jsonb(v_skipped)
    );
  end if;

  -- ── เช็ค limit แพ็กเกจ (นับห้อง active ทุกสาขาใน hotel) — อยู่ใน lock แล้ว ──
  v_limit := public.hotel_max_rooms(p_hotel_id);
  if v_limit is not null then
    select count(*) into v_current
      from public.rooms
     where hotel_id = p_hotel_id and deleted_at is null;

    if v_current + v_to_add > v_limit then
      raise exception 'เกินจำนวนห้องของแพ็กเกจ — ใช้ % / % แล้ว (จะเพิ่มอีก %)',
        v_current, v_limit, v_to_add
        using errcode = 'P0001';
    end if;
  end if;

  -- ── ปลุกห้องที่เคยลบกลับมา (เลขห้องถูกจองโดย unique constraint อยู่) ──
  if coalesce(array_length(v_restored, 1), 0) > 0 then
    update public.rooms
       set deleted_at = null,
           is_active = true,
           room_type_id = p_room_type_id,
           floor = coalesce(p_floor, floor),
           updated_at = now()
     where property_id = p_property_id
       and room_number = any(v_restored);
  end if;

  -- ── insert ห้องใหม่ทั้งชุดใน statement เดียว (trigger rooms_sync_inventory recalc ให้เอง) ──
  if coalesce(array_length(v_added, 1), 0) > 0 then
    insert into public.rooms (hotel_id, property_id, room_type_id, room_number, floor)
    select p_hotel_id, p_property_id, p_room_type_id, rn, p_floor
      from unnest(v_added) as t(rn);

    select id into v_first_id
      from public.rooms
     where property_id = p_property_id and room_number = v_added[1];
  end if;

  -- ── audit (ครั้งเดียวต่อ batch ไม่ใช่ต่อห้อง) ──
  perform public.log_audit(
    p_hotel_id, 'room.bulk_created', 'room', v_first_id, null,
    jsonb_build_object(
      'room_numbers', to_jsonb(v_added),
      'restored', to_jsonb(v_restored),
      'count', v_to_add,
      'room_type_id', p_room_type_id
    )
  );

  return jsonb_build_object(
    'added', v_to_add,
    'added_rooms', to_jsonb(v_added || v_restored),
    'restored', coalesce(array_length(v_restored, 1), 0),
    'skipped', to_jsonb(v_skipped)
  );
end $$;

comment on function public.create_rooms_bulk is
  'เพิ่มห้องหลายห้อง atomic — เช็คสิทธิ์+limit+ซ้ำ ใน transaction เดียว · ปลุกห้องที่ soft-delete คืน · คืน jsonb {added, added_rooms, restored, skipped}';

revoke all on function public.create_rooms_bulk(uuid,uuid,uuid,text[],text) from anon;
grant execute on function public.create_rooms_bulk(uuid,uuid,uuid,text[],text) to authenticated;
