import { redirect } from "next/navigation";

// /super-admin → /super-admin/dashboard (กัน 404 ตอนพิมพ์ URL สั้น)
export default function SuperAdminIndex() {
  redirect("/super-admin/dashboard");
}
