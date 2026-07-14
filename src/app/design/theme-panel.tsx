// ThemePanel — บังคับ theme (light/dark) ในกล่องเดียว โดยไม่กระทบทั้งหน้า
// ใช้โชว์ light vs dark คู่กันในหน้า /design (data-theme ที่ scope ในกล่อง)
// tokens อ่าน data-theme ได้ทุกระดับ (ไม่ใช่แค่ :root) เพราะ CSS var cascade

export function ThemePanel({
  theme,
  children,
}: {
  theme: "light" | "dark";
  children: React.ReactNode;
}) {
  return (
    <div
      data-theme={theme}
      className="overflow-hidden rounded-lg border border-border bg-bg text-fg"
    >
      <div className="flex items-center justify-between border-b border-border bg-bg-subtle px-3 py-1.5">
        <span className="text-xs font-medium text-fg-muted">
          {theme === "light" ? "☀︎ Light" : "☾ Dark"}
        </span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}
