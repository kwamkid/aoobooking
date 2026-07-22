// แปลงข้อความเลขห้องแบบยืดหยุ่น → รายการเลขห้อง
// รองรับหลายแบบผสมกันได้ในช่องเดียว (คั่นด้วย , หรือ เว้นวรรค หรือ ขึ้นบรรทัดใหม่):
//   "101, 102, 105"     → 101, 102, 105          (ทีละตัว)
//   "101-110"           → 101 … 110              (ช่วง)
//   "101-105, 201, 301-303" → ผสมกันได้
//   "A1-A5"             → A1 … A5                (มี prefix ตัวอักษร)
//   "101, 101"          → 101                    (ตัดซ้ำในตัวเอง)
//
// กติกา:
// - ช่วงต้องมี prefix เดียวกัน ("A1-B5" = error)
// - ช่วงต้องนับขึ้น ("110-101" = error)
// - รักษา leading zero ตามความกว้างของตัวเริ่ม ("001-003" → 001, 002, 003)

export type ParseResult =
  | { ok: true; rooms: string[] }
  | { ok: false; error: string };

const MAX_ROOMS = 200; // กันพิมพ์ผิดแบบ "1-99999" ถล่ม DB

// แยก prefix ตัวอักษร + ส่วนตัวเลขท้าย เช่น "A101" → ["A", "101"]
function splitToken(s: string): { prefix: string; num: string } | null {
  const m = s.match(/^([^\d]*)(\d+)$/);
  if (!m) return null;
  return { prefix: m[1], num: m[2] };
}

export function parseRoomNumbers(input: string): ParseResult {
  const raw = input.trim();
  if (!raw) return { ok: false, error: "กรุณาใส่เลขห้อง" };

  // รวบเว้นวรรครอบ "-" ก่อน เพื่อให้ "101 - 110" ยังเป็น token เดียว (คนพิมพ์แบบนี้บ่อย)
  // ทำก่อน split เสมอ ไม่งั้น "-" จะหลุดเป็น token เดี่ยว
  const normalized = raw.replace(/\s*[-–]\s*/g, "-");

  // คั่นด้วย comma / เว้นวรรค / ขึ้นบรรทัดใหม่ ผสมกันได้
  const tokens = normalized
    .split(/[,\s\n]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  const out: string[] = [];
  const seen = new Set<string>();

  for (const token of tokens) {
    // ── ช่วง: 101-110 หรือ A1-A5 ──
    const rangeMatch = token.match(/^(.+?)-(.+)$/);
    if (rangeMatch) {
      const from = splitToken(rangeMatch[1].trim());
      const to = splitToken(rangeMatch[2].trim());

      // ไม่ใช่ช่วงตัวเลข (เช่น "Suite-A") → ถือเป็นชื่อห้องธรรมดา ไม่ใช่ error
      if (!from || !to) {
        if (!seen.has(token)) {
          seen.add(token);
          out.push(token);
        }
        continue;
      }
      if (from.prefix !== to.prefix) {
        return {
          ok: false,
          error: `ช่วง "${token}" ใช้ชื่อนำหน้าต่างกัน (${from.prefix || "ไม่มี"} กับ ${
            to.prefix || "ไม่มี"
          }) — ต้องเหมือนกัน เช่น A1-A5`,
        };
      }

      const start = parseInt(from.num, 10);
      const end = parseInt(to.num, 10);
      if (end < start) {
        return { ok: false, error: `ช่วง "${token}" ต้องเรียงจากน้อยไปมาก เช่น 101-110` };
      }
      if (end - start + 1 > MAX_ROOMS) {
        return {
          ok: false,
          error: `ช่วง "${token}" มี ${end - start + 1} ห้อง — เกิน ${MAX_ROOMS} ห้องต่อครั้ง`,
        };
      }

      // รักษา leading zero ตามความกว้างตัวเริ่ม (001-003 → 001,002,003)
      const width = from.num.length;
      const pad = from.num.startsWith("0") ? width : 0;

      for (let i = start; i <= end; i++) {
        const numStr = pad ? String(i).padStart(pad, "0") : String(i);
        const room = from.prefix + numStr;
        if (!seen.has(room)) {
          seen.add(room);
          out.push(room);
        }
      }
      continue;
    }

    // ── ตัวเดียว: 101 หรือ A1 หรือ Suite-A (ชื่อห้องอิสระก็ได้) ──
    if (!seen.has(token)) {
      seen.add(token);
      out.push(token);
    }
  }

  if (out.length === 0) return { ok: false, error: "ไม่พบเลขห้องที่ใช้ได้" };
  if (out.length > MAX_ROOMS) {
    return { ok: false, error: `รวม ${out.length} ห้อง — เกิน ${MAX_ROOMS} ห้องต่อครั้ง` };
  }

  return { ok: true, rooms: out };
}
