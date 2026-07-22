"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { CheckoutModal, type CheckoutPerms } from "../bookings/checkout-modal";

/* ปุ่มเช็คเอาท์ในหน้างานวันนี้ — เปิด checkout modal (สรุปบิล + รับเงิน + เช็คเอาท์)
 * แทน ActionButton เดิมที่ยิง RPC ตรงแล้วเจอ error "ยังมียอดค้าง" */

export function CheckoutButton({
  hotelSlug,
  bookingId,
  code,
  guestName,
  balanceSatang,
  perms,
}: {
  hotelSlug: string;
  bookingId: string;
  code: string;
  guestName: string | null;
  balanceSatang: number;
  perms: CheckoutPerms;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="text-right">
      <Button size="sm" onClick={() => setOpen(true)}>
        {balanceSatang > 0 ? "เก็บเงิน & เช็คเอาท์" : "เช็คเอาท์"}
      </Button>
      <CheckoutModal
        open={open}
        onClose={() => setOpen(false)}
        hotelSlug={hotelSlug}
        bookingId={bookingId}
        code={code}
        guestName={guestName}
        perms={perms}
      />
    </div>
  );
}
