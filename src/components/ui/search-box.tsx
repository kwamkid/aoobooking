import { Search } from "lucide-react";
import type { ComponentProps } from "react";

function cx(...parts: (string | false | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

// SearchBox — ช่องค้นหาพร้อมไอคอน (ใช้ในหลายหน้า: guests/bookings/audit)
export function SearchBox({
  className,
  ...props
}: ComponentProps<"input">) {
  return (
    <div className={cx("relative", className)}>
      <Search
        size={16}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle"
      />
      <input className="field pl-9" {...props} />
    </div>
  );
}
