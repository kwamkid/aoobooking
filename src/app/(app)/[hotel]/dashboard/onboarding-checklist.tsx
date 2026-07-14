import Link from "next/link";
import { Check, ChevronRight } from "lucide-react";
import { hotelHref } from "@/lib/hotel/href";
import { Card } from "@/components/ui";
import type { SetupStatus } from "./setup-status";

// Onboarding checklist — การ์ดแรกในหน้า dashboard จนกว่าจะตั้งค่าครบ
// step ที่ทำแล้ว = ติ๊กเขียว · step ถัดไปที่ยังไม่ทำ = ไฮไลต์ + ปุ่มเข้าไปทำ
export function OnboardingChecklist({
  status,
  hotelSlug,
}: {
  status: SetupStatus;
  hotelSlug: string;
}) {
  const { steps, requiredDone, requiredTotal } = status;
  const pct = Math.round((requiredDone / requiredTotal) * 100);

  // step แรกที่ยังไม่ทำ (ไม่รวม optional) = ตัวที่ควรทำต่อ → เน้น
  const nextKey = steps.find((s) => !s.optional && !s.done)?.key;

  return (
    <Card pad={false} className="overflow-hidden">
      <div className="border-b border-border p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-fg">เริ่มต้นใช้งาน</h2>
            <p className="mt-0.5 text-sm text-fg-muted">
              ตั้งค่าไม่กี่ขั้นตอน แล้วเริ่มรับจองได้เลย
            </p>
          </div>
          <span className="shrink-0 text-sm font-medium text-fg-muted">
            {requiredDone}/{requiredTotal}
          </span>
        </div>
        {/* progress bar */}
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-bg-subtle">
          <div
            className="h-full rounded-full bg-brand transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <ol className="divide-y divide-border">
        {steps.map((step, i) => {
          const isNext = step.key === nextKey;
          const href = hotelHref(step.href, hotelSlug);
          return (
            <li key={step.key}>
              <Link
                href={href}
                className={`flex items-center gap-3 px-5 py-4 transition-colors ${
                  isNext ? "bg-brand-soft/40" : "hover:bg-bg-subtle"
                }`}
              >
                {/* status dot */}
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                    step.done
                      ? "bg-brand text-brand-fg"
                      : isNext
                        ? "border-2 border-brand text-brand"
                        : "border border-border text-fg-subtle"
                  }`}
                >
                  {step.done ? <Check size={15} strokeWidth={3} /> : i + 1}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span
                      className={`text-sm font-medium ${
                        step.done ? "text-fg-muted line-through" : "text-fg"
                      }`}
                    >
                      {step.title}
                    </span>
                    {step.optional && (
                      <span className="rounded-sm bg-bg-subtle px-1.5 py-0.5 text-xs text-fg-subtle">
                        ไม่บังคับ
                      </span>
                    )}
                  </span>
                  {!step.done && (
                    <span className="mt-0.5 block text-xs text-fg-muted">
                      {step.description}
                    </span>
                  )}
                </span>

                {!step.done && (
                  <ChevronRight size={18} className="shrink-0 text-fg-subtle" />
                )}
              </Link>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
