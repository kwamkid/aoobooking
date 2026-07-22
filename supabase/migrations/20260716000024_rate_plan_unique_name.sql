-- กัน rate plan ชื่อซ้ำในสาขาเดียวกัน (เจ้าของเผลอกรอก "Flexible" ซ้ำ → UI โชว์คูณสอง งง)
-- ระบบต้องเตือนตั้งแต่ตอนสร้าง ไม่ใช่ปล่อยเงียบ

-- 1) dedupe ของเดิมก่อน — เก็บอันเก่าสุดต่อ (property, ชื่อ) · ตัวใหม่กว่า soft-delete
--    (ตอนนี้มีแค่ Flexible ซ้ำ 1 คู่ ยังไม่มีราคาผูก — ปลอดภัย)
update public.rate_plans rp
   set deleted_at = now()
 where rp.deleted_at is null
   and exists (
     select 1 from public.rate_plans k
      where k.property_id = rp.property_id
        and lower(k.name) = lower(rp.name)
        and k.deleted_at is null
        and (k.created_at < rp.created_at
             or (k.created_at = rp.created_at and k.id < rp.id))
   );

-- 2) unique เฉพาะแถว active — ลบแล้วสร้างชื่อเดิมใหม่ได้ (partial index)
create unique index rate_plans_name_unique
  on public.rate_plans (property_id, lower(name))
  where deleted_at is null;
