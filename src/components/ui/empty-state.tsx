// EmptyState — สถานะว่าง + SVG minimal outline art (วาดเอง, ใช้ currentColor ตาม theme)
// spot illustration สไตล์ japanese minimal (outline) — เปลี่ยนได้ผ่าน prop art

type Art = "bed" | "calendar" | "guest" | "search" | "receipt";

export function EmptyState({
  title,
  description,
  action,
  art = "bed",
}: {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  art?: Art;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border px-6 py-12 text-center">
      <MinimalArt art={art} />
      <p className="mt-4 font-medium text-fg">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-fg-muted">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// outline SVG — stroke = currentColor (brand), soft fill = ตัวแปร (theme-aware)
function MinimalArt({ art }: { art: Art }) {
  const common = {
    width: 88,
    height: 88,
    viewBox: "0 0 88 88",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "text-brand",
  };
  const soft = { fill: "var(--brand-soft)", stroke: "none" };

  switch (art) {
    case "calendar":
      return (
        <svg {...common} aria-hidden>
          <rect x="16" y="20" width="56" height="52" rx="6" {...soft} />
          <rect x="16" y="20" width="56" height="52" rx="6" />
          <path d="M16 34h56" />
          <path d="M30 14v10M58 14v10" />
          <circle cx="34" cy="48" r="3" fill="currentColor" stroke="none" />
          <circle cx="54" cy="48" r="3" fill="currentColor" stroke="none" />
          <path d="M32 60c3 3 5 4 12 4s9-1 12-4" />
        </svg>
      );
    case "guest":
      return (
        <svg {...common} aria-hidden>
          <circle cx="44" cy="34" r="14" {...soft} />
          <circle cx="44" cy="34" r="14" />
          <path d="M20 72c2-13 12-20 24-20s22 7 24 20" {...soft} />
          <path d="M20 72c2-13 12-20 24-20s22 7 24 20" />
          <circle cx="39" cy="33" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="49" cy="33" r="1.5" fill="currentColor" stroke="none" />
          <path d="M39 40c2 2 8 2 10 0" />
        </svg>
      );
    case "search":
      return (
        <svg {...common} aria-hidden>
          <circle cx="38" cy="38" r="20" {...soft} />
          <circle cx="38" cy="38" r="20" />
          <path d="M53 53l16 16" />
          <path d="M31 38a7 7 0 017-7" />
        </svg>
      );
    case "receipt":
      return (
        <svg {...common} aria-hidden>
          <path d="M24 14h40v60l-8-5-8 5-8-5-8 5-8-5V14z" {...soft} />
          <path d="M24 14h40v60l-8-5-8 5-8-5-8 5-8-5V14z" />
          <path d="M34 30h20M34 42h20M34 54h12" />
        </svg>
      );
    case "bed":
    default:
      return (
        <svg {...common} aria-hidden>
          <path d="M14 30v34M74 46v18M14 64h60" />
          <path d="M14 46h60a0 0 0 010 0v0a0 0 0 010 0" />
          <path d="M14 48c0-4 3-8 8-8h44c5 0 8 4 8 8v-2H14z" {...soft} />
          <path d="M14 48c0-4 3-8 8-8h44c5 0 8 4 8 8" />
          <rect x="22" y="30" width="16" height="10" rx="4" {...soft} />
          <rect x="22" y="30" width="16" height="10" rx="4" />
        </svg>
      );
  }
}
