function cx(...parts: (string | false | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

type Tone = "neutral" | "brand" | "success" | "warning" | "danger" | "info";

const toneClass: Record<Tone, string> = {
  neutral: "badge-neutral",
  brand: "badge-brand",
  success: "badge-success",
  warning: "badge-warning",
  danger: "badge-danger",
  info: "badge-info",
};

// Badge — label สถานะ (booking status, PDPA, role ฯลฯ)
export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return <span className={cx("badge", toneClass[tone], className)}>{children}</span>;
}

// map booking status → tone (ใช้ร่วมทั้ง bookings list + front-desk)
export const BOOKING_STATUS_TONE: Record<string, Tone> = {
  pending: "warning",
  confirmed: "info",
  checked_in: "success",
  checked_out: "neutral",
  cancelled: "danger",
  no_show: "danger",
};
