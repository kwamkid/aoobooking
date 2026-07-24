"use client";

import { useState } from "react";
import { Button, useConfirm, useToast } from "@/components/ui";
import { isNextControlFlowError } from "@/lib/next-error";
import { confirmBooking, cancelBooking, markNoShow } from "../actions";
import { PaymentModal, type PaymentPerms } from "../payment-modal";
import { CheckoutModal } from "../checkout-modal";
import { CheckInModal } from "../checkin-modal";

/* ปุ่ม action ของหน้ารายละเอียดการจอง — ตามสถานะ + สิทธิ์ (ชั้น UI · server เช็คซ้ำ)
 * ใช้ server action ชุดเดียวกับหน้า list — audit log ครบเหมือนกัน */

export type DetailPerms = {
  edit: boolean;
  cancel: boolean;
  checkin: boolean;
  checkout: boolean;
  payView: boolean;
} & PaymentPerms;

export function DetailActions({
  hotelSlug,
  bookingId,
  code,
  status,
  checkIn,
  guestName,
  perms,
}: {
  hotelSlug: string;
  bookingId: string;
  code: string;
  status: string;
  /** วันเข้าพัก (YYYY-MM-DD) — ปุ่ม No-show โชว์ตั้งแต่วันนี้ >= วันเข้าพัก */
  checkIn: string;
  guestName: string | null;
  perms: DetailPerms;
}) {
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [pending, setPending] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkinOpen, setCheckinOpen] = useState(false);

  async function run(action: (fd: FormData) => Promise<void>, okMsg: string) {
    setPending(true);
    try {
      const fd = new FormData();
      fd.set("hotelSlug", hotelSlug);
      fd.set("bookingId", bookingId);
      await action(fd);
      toast.ok(okMsg);
    } catch (e) {
      if (isNextControlFlowError(e)) throw e;
      toast.err(e instanceof Error ? e.message : "ทำรายการไม่สำเร็จ");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {dialog}
      {perms.payView && (
        <>
          <Button variant="secondary" onClick={() => setPayOpen(true)}>
            การชำระเงิน
          </Button>
          <PaymentModal
            open={payOpen}
            onClose={() => setPayOpen(false)}
            hotelSlug={hotelSlug}
            bookingId={bookingId}
            bookingCode={code}
            guestName={guestName}
            bookingStatus={status}
            perms={{
              charge: perms.charge,
              verify: perms.verify,
              voidPay: perms.voidPay,
              refund: perms.refund,
            }}
          />
        </>
      )}
      {status === "pending" && perms.edit && (
        <Button disabled={pending} onClick={() => run(confirmBooking, `ยืนยัน ${code} แล้ว`)}>
          ยืนยันการจอง
        </Button>
      )}
      {status === "confirmed" && perms.checkin && (
        <>
          {/* เช็คอิน = เลือกเบอร์ห้องก่อน (จองผูกแค่ประเภทห้อง) */}
          <Button disabled={pending} onClick={() => setCheckinOpen(true)}>
            เช็คอิน
          </Button>
          <CheckInModal
            open={checkinOpen}
            onClose={() => setCheckinOpen(false)}
            hotelSlug={hotelSlug}
            bookingId={bookingId}
            code={code}
            guestName={guestName}
          />
        </>
      )}
      {status === "checked_in" && perms.checkout && (
        <>
          {/* เช็คเอาท์ = สรุปบิล + รับเงินยอดค้างจบในจังหวะเดียว (checkout modal) */}
          <Button disabled={pending} onClick={() => setCheckoutOpen(true)}>
            เช็คเอาท์
          </Button>
          <CheckoutModal
            open={checkoutOpen}
            onClose={() => setCheckoutOpen(false)}
            hotelSlug={hotelSlug}
            bookingId={bookingId}
            code={code}
            guestName={guestName}
            perms={{ charge: perms.charge, verify: perms.verify, refund: perms.refund }}
          />
        </>
      )}
      {/* No-show โชว์ตั้งแต่วันเข้าพัก (เทียบวัน UTC ให้ตรง current_date ใน RPC) */}
      {(status === "pending" || status === "confirmed") &&
        perms.cancel &&
        new Date().toISOString().slice(0, 10) >= checkIn && (
          <Button
            variant="ghost"
            className="text-danger-strong"
            disabled={pending}
            onClick={async () => {
              const ok = await confirm({
                title: `บันทึกว่าไม่มาเข้าพัก (No-show) · ${code}?`,
                description:
                  "คืนที่เหลือจะกลับมาว่างขายต่อได้ · เงินที่ชำระแล้วจะถูกยึดหรือคืนตามนโยบายยกเลิกของแพ็กเกจราคา",
                tone: "danger",
                confirmLabel: "บันทึก No-show",
              });
              if (!ok) return;
              setPending(true);
              try {
                const fd = new FormData();
                fd.set("hotelSlug", hotelSlug);
                fd.set("bookingId", bookingId);
                const r = await markNoShow(fd);
                toast.ok(
                  r.refundSatang > 0
                    ? `บันทึก No-show แล้ว — มียอดคืนตามนโยบาย ${(r.refundSatang / 100).toLocaleString("th-TH")}฿ กดยืนยันคืนได้ที่ การชำระเงิน`
                    : "บันทึก No-show แล้ว",
                );
              } catch (e) {
                if (isNextControlFlowError(e)) throw e;
                toast.err(e instanceof Error ? e.message : "ทำรายการไม่สำเร็จ");
              } finally {
                setPending(false);
              }
            }}
          >
            ไม่มาเข้าพัก
          </Button>
        )}
      {(status === "pending" || status === "confirmed") && perms.cancel && (
        <Button
          variant="ghost"
          className="text-danger-strong"
          disabled={pending}
          onClick={async () => {
            const ok = await confirm({
              title: `ยกเลิกการจอง ${code}?`,
              description:
                "ห้องจะกลับไปว่างทันที · เงินที่ชำระแล้วจะคำนวณคืนตามนโยบายยกเลิกของแพ็กเกจราคา",
              tone: "danger",
              confirmLabel: "ยกเลิกการจอง",
            });
            if (ok) run(cancelBooking, `ยกเลิก ${code} แล้ว`);
          }}
        >
          ยกเลิกการจอง
        </Button>
      )}
    </div>
  );
}
