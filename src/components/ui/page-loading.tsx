/* PageLoading — skeleton โครงหน้า AppPage ระหว่างโหลด (ใช้ใน loading.tsx ทุก segment)
 * โชว์ทันทีที่กดเมนู (Next แสดง loading.tsx ก่อน server component เสร็จ)
 * ใช้ animate-pulse ของ Tailwind + token ล้วน — server component ได้ */

function Bone({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-(--radius) bg-bg-subtle ${className ?? ""}`} />;
}

export function PageLoading() {
  return (
    <div className="p-4 sm:p-8" aria-busy aria-label="กำลังโหลด">
      {/* header: title + action */}
      <div className="mb-6 flex items-start justify-between gap-3">
        <div className="space-y-2">
          <Bone className="h-7 w-48" />
          <Bone className="h-4 w-72" />
        </div>
        <Bone className="h-10 w-32" />
      </div>

      {/* แถว filter/tabs */}
      <div className="mb-6 flex gap-2">
        <Bone className="h-9 w-24" />
        <Bone className="h-9 w-24" />
        <Bone className="h-9 w-24" />
      </div>

      {/* เนื้อหา: การ์ด/ตาราง */}
      <div className="space-y-3">
        <Bone className="h-24 w-full" />
        <Bone className="h-24 w-full" />
        <Bone className="h-24 w-full" />
      </div>
    </div>
  );
}
