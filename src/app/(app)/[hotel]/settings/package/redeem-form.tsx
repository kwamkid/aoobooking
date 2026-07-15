"use client";

import { useState } from "react";
import { Card, Field, Input, Button, useToast } from "@/components/ui";
import { redeemPromoCode } from "./actions";

export function RedeemForm({ hotelSlug }: { hotelSlug: string }) {
  const toast = useToast();
  const [code, setCode] = useState("");

  async function onSubmit(fd: FormData) {
    try {
      const res = await redeemPromoCode(fd);
      const until = new Date(res.trial_until).toLocaleDateString("th-TH");
      toast.ok(`ใช้โค้ดสำเร็จ — ฟรี ${res.free_months} เดือน ถึง ${until}`);
      setCode("");
    } catch (e) {
      toast.err(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    }
  }

  return (
    <Card className="mt-4">
      <h2 className="font-bold text-fg">มีโค้ดโปรโมชัน?</h2>
      <p className="mt-1 text-sm text-fg-muted">กรอกโค้ดเพื่อรับสิทธิ์ใช้ฟรี</p>

      <form action={onSubmit} className="mt-3 flex flex-wrap items-end gap-3">
        <input type="hidden" name="hotelSlug" value={hotelSlug} />
        <Field label="โค้ดโปรโมชัน" className="min-w-0 flex-1">
          <Input
            name="code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="FREE3M"
            autoComplete="off"
            required
            className="font-mono uppercase"
          />
        </Field>
        <Button type="submit">ใช้โค้ด</Button>
      </form>
    </Card>
  );
}
