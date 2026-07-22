"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { CheckInModal } from "../bookings/checkin-modal";

// ปุ่มเช็คอินหน้างานวันนี้ — เปิด modal เลือกเบอร์ห้องก่อนยืนยัน
export function CheckInButton({
  hotelSlug,
  bookingId,
  code,
  guestName,
}: {
  hotelSlug: string;
  bookingId: string;
  code: string;
  guestName: string | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="text-right">
      <Button size="sm" onClick={() => setOpen(true)}>
        เช็คอิน
      </Button>
      <CheckInModal
        open={open}
        onClose={() => setOpen(false)}
        hotelSlug={hotelSlug}
        bookingId={bookingId}
        code={code}
        guestName={guestName}
      />
    </div>
  );
}
