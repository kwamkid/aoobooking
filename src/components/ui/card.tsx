import type { ElementType, ComponentPropsWithoutRef } from "react";

function cx(...parts: (string | false | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

// Card — surface กล่องมาตรฐาน (มี padding ด้วย pad=true)
// polymorphic: as="li" ฯลฯ ได้ (default div)
type CardProps<T extends ElementType> = {
  as?: T;
  pad?: boolean;
} & Omit<ComponentPropsWithoutRef<T>, "as">;

export function Card<T extends ElementType = "div">({
  as,
  pad = true,
  className,
  ...props
}: CardProps<T>) {
  const Tag = (as ?? "div") as ElementType;
  return <Tag className={cx("card", pad && "card-pad", className)} {...props} />;
}
