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
  const [mode, setMode] = useState<Mode>("system");

  // sync จาก localStorage ตอน mount
  useEffect(() => {
    const saved = (localStorage.getItem(KEY) as Mode) ?? "system";
    setMode(saved);
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
