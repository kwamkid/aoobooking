import { revalidatePath } from "next/cache";
import { hotelHref } from "./href";

// revalidate หน้าหลังบ้านของโรงแรม — path ต้องมี /[hotel] นำหน้าเสมอ (path-based routing)
// bug ที่เคยเจอ: revalidatePath("/rooms") ไม่ตรง route จริง /[hotel]/rooms → cache ไม่ล้าง
// ใช้ hotelHref() ตัวเดียวกับฝั่ง link เพื่อให้ URL shape เปลี่ยนที่เดียว
export function revalidateHotel(hotelSlug: string, ...paths: string[]) {
  for (const p of paths) {
    revalidatePath(hotelHref(p, hotelSlug));
  }
  // dashboard มี onboarding checklist ที่นับ rooms/rates/bookings → ให้สดเสมอ
  revalidatePath(hotelHref("/dashboard", hotelSlug));
}
