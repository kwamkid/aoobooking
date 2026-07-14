"use client";

import { useState } from "react";
import { Input, Button, useToast } from "@/components/ui";
import { createHotel } from "./actions";

export function CreateHotelForm() {
  const [pending, setPending] = useState(false);
  const toast = useToast();

  return (
    <form
      action={async (fd) => {
        setPending(true);
        try {
          await createHotel(fd);
        } catch (e) {
          setPending(false);
          toast.err(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
        }
      }}
      className="flex flex-col gap-3"
    >
      <Input name="name" placeholder="ชื่อโรงแรม (เช่น บ้านสวนรีสอร์ท)" required />
      <Input
        name="slug"
        placeholder="slug (เว้นว่างได้ — จะสร้างจากชื่อ)"
        pattern="[a-z0-9-]*"
        className="font-mono text-sm"
      />
      <Button type="submit" disabled={pending}>
        {pending ? "กำลังสร้าง..." : "สร้างโรงแรม"}
      </Button>
    </form>
  );
}
