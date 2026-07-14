import type { ComponentProps } from "react";

function cx(...parts: (string | false | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

// Table — wrapper ที่ scroll แนวนอนบนจอเล็ก (responsive rules.md #18)
export function Table({ className, ...props }: ComponentProps<"table">) {
  return (
    <div className="-mx-1 overflow-x-auto">
      <table className={cx("table", className)} {...props} />
    </div>
  );
}

export function THead(props: ComponentProps<"thead">) {
  return <thead {...props} />;
}
export function TBody(props: ComponentProps<"tbody">) {
  return <tbody {...props} />;
}
export function TR(props: ComponentProps<"tr">) {
  return <tr {...props} />;
}
export function TH(props: ComponentProps<"th">) {
  return <th {...props} />;
}
export function TD(props: ComponentProps<"td">) {
  return <td {...props} />;
}
