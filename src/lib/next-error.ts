// Next ใช้ "throw error พิเศษ" เป็นกลไกควบคุมการทำงาน (ไม่ใช่ error จริง):
//   redirect()  → digest = "NEXT_REDIRECT;replace;/path;307;"
//   notFound()  → digest = "NEXT_NOT_FOUND"
// framework เป็นคนจับไปทำ navigation → ถ้า try/catch ของเราดักไว้เอง
// navigation จะไม่เกิด + ผู้ใช้เห็นคำว่า "NEXT_REDIRECT" เป็นข้อความ error
//
// ทุก try/catch ที่ครอบ server action ต้องเช็คตัวนี้แล้ว re-throw เสมอ
export function isNextControlFlowError(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  const digest = (e as { digest?: unknown }).digest;
  return (
    typeof digest === "string" &&
    (digest.startsWith("NEXT_REDIRECT") || digest === "NEXT_NOT_FOUND")
  );
}
