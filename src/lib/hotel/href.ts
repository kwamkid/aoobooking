// helper เดียวสำหรับ URL หลังบ้าน — active tenant อยู่ใน path segment แรก
// /[hotel]/dashboard เช่น /abchotel/dashboard (path-based — ขึ้นชื่อโรงแรมใน URL)
// ปรับ URL shape ที่เดียวได้ (BLUEPRINT §3 — เปลี่ยนจาก ?h= เป็น path 2026-07-15)

export function hotelHref(path: string, hotelSlug: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  // /dashboard + abchotel → /abchotel/dashboard
  // "/" (dashboard root) → /abchotel
  return clean === "/" ? `/${hotelSlug}` : `/${hotelSlug}${clean}`;
}
