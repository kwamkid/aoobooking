// helper เดียวสำหรับ URL หลังบ้าน — active tenant เดินทางผ่าน ?h=<hotel-slug>
// ปรับ URL shape ที่เดียวได้ (BLUEPRINT §3)

export function hotelHref(path: string, hotelSlug: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  const sep = clean.includes("?") ? "&" : "?";
  return `${clean}${sep}h=${encodeURIComponent(hotelSlug)}`;
}
