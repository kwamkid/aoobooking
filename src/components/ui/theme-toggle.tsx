"use client";

import { useEffect, useState } from "react";
import { Sun, Moon, Monitor } from "lucide-react";

// ThemeToggle — สลับ light / dark / system
// เขียน data-theme ลง <html> (light/dark ชนะ prefers-color-scheme) + จำใน localStorage
// tokens รองรับ :root[data-theme=...] อยู่แล้ว (globals.css)
type Mode = "light" | "dark" | "system";
const KEY = "aoo-theme";

function apply(mode: Mode) {
  const root = document.documentElement;
  if (mode === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", mode);
}

export function ThemeToggle() {
  // default "system" ตอน SSR — sync ค่าจริงจาก localStorage หลัง mount (ไม่ apply ซ้ำ
  // เพราะ inline script ใน <head> ตั้ง data-theme ไปแล้วก่อน render = ไม่มี flash)
  const [mode, setMode] = useState<Mode>("system");

  useEffect(() => {
    const saved = (localStorage.getItem(KEY) as Mode) ?? "system";
    setMode(saved);
    // ป้องกันเคส data-theme กับ localStorage หลุด sync (เช่นเปิดหลาย tab)
    apply(saved);
  }, []);

  function set(next: Mode) {
    setMode(next);
    apply(next);
    if (next === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, next);
  }

  const opts: { m: Mode; Icon: typeof Sun; label: string }[] = [
    { m: "light", Icon: Sun, label: "สว่าง" },
    { m: "dark", Icon: Moon, label: "มืด" },
    { m: "system", Icon: Monitor, label: "ตามระบบ" },
  ];

  return (
    <div className="inline-flex rounded-(--radius) border border-border p-0.5">
      {opts.map(({ m, Icon, label }) => (
        <button
          key={m}
          onClick={() => set(m)}
          title={label}
          aria-pressed={mode === m}
          className={`flex items-center justify-center rounded-[calc(var(--radius)-2px)] p-1.5 transition-colors ${
            mode === m
              ? "bg-brand text-brand-fg"
              : "text-fg-muted hover:bg-bg-subtle"
          }`}
        >
          <Icon size={16} />
        </button>
      ))}
    </div>
  );
}
