import { PageLoading } from "@/components/ui";

// skeleton ระหว่างหน้าโหลด — ต้องมีในแต่ละ segment ถึงจะโชว์ตอนสลับเมนู
// (loading.tsx ของ parent ไม่ trigger ตอน navigate ระหว่าง sibling — bugs.md §React)
export default function Loading() {
  return <PageLoading />;
}
