import Link from "next/link";
import type { ComponentProps } from "react";

// Button — variant/size ผ่าน class จาก design system (globals.css .btn-*)
type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const variantClass: Record<Variant, string> = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  ghost: "btn-ghost",
  danger: "btn-danger",
};
const sizeClass: Record<Size, string> = { sm: "btn-sm", md: "", lg: "btn-lg" };

function cx(...parts: (string | false | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return (
    <button
      className={cx("btn", variantClass[variant], sizeClass[size], className)}
      {...props}
    />
  );
}

// ปุ่มที่เป็นลิงก์ (navigation) — หน้าตาเหมือน Button
export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return (
    <Link
      className={cx("btn", variantClass[variant], sizeClass[size], className)}
      {...props}
    />
  );
}
