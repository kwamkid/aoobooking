"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal, Button, useToast } from "@/components/ui";
import { isNextControlFlowError } from "@/lib/next-error";
import type { PaymentMethod } from "@/components/payments/method-tile";
import { checkOutBooking } from "../front-desk/actions";
import { PaymentFormFields } from "./payment-form-fields";
import {
  getCheckoutSummary,
  recordBookingPayment,
  verifyBookingSlip,
  type CheckoutSummary,
} from "./payment-actions";

/* Checkout modal — "จ่ายตอนเช็คเอาท์" (เจ้าของชี้ 2026-07-21): กดเช็คเอาท์ →
 * เห็นสรุปบิลทั้งใบ (folio) + ยอดค้าง → รับเงินตรงนั้น → ครบแล้วเช็คเอาท์ให้เลย
 * · จ่ายบางส่วนได้ — บันทึกแล้วยอดขยับ ค้างเหลือเท่าไหร่โชว์ต่อ ครบเมื่อไหร่ค่อยปิด
 * · โอนธนาคารตอนเช็คเอาท์: พนักงานเห็นเงินเข้าแล้ว = กดยืนยันสลิปในจังหวะเดียว
 *   (ต้องมีสิทธิ์ payments.verify_slip — ไม่มีก็บันทึกเป็นรอตรวจ เช็คเอาท์ยังไม่ได้) */

export type CheckoutPerms = { charge: boolean; verify: boolean };

function baht(satang: number): string {
  return (satang / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 });
}

export function CheckoutModal({
  open,
  onClose,
  hotelSlug,
  bookingId,
  code,
  guestName,
  perms,
}: {
  open: boolean;
  onClose: () => void;
  hotelSlug: string;
  bookingId: string;
  code: string;
  guestName: string | null;
  perms: CheckoutPerms;
}) {
  const router = useRouter();
  const toast = useToast();
  const [summary, setSummary] = useState<CheckoutSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [accountId, setAccountId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const s = await getCheckoutSummary(hotelSlug, bookingId);
      setSummary(s);
      setMethod((m) => (s.methods.includes(m) ? m : (s.methods[0] ?? "cash")));
      setAmount(s.balanceSatang > 0 ? String(s.balanceSatang / 100) : "");
      return s;
    } catch (e) {
      if (isNextControlFlowError(e)) throw e;
      toast.err(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ");
      return null;
    } finally {
      setLoading(false);
    }
    // toast จาก provider — อ้างอิงคงที่
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotelSlug, bookingId]);

  useEffect(() => {
    if (open) load();
    else setSummary(null);
  }, [open, load]);

  async function doCheckout() {
    const fd = new FormData();
    fd.set("hotelSlug", hotelSlug);
    fd.set("bookingId", bookingId);
    await checkOutBooking(fd);
    toast.ok(`เช็คเอาท์ ${code} แล้ว`);
    onClose();
    router.refresh();
  }

  // รับเงินยอดที่กรอก → ถ้าครบแล้วเช็คเอาท์ต่อทันที · ยังไม่ครบ = โชว์ยอดค้างที่เหลือ
  async function onPayAndCheckout(fd: FormData) {
    setBusy(true);
    try {
      fd.set("hotelSlug", hotelSlug);
      fd.set("bookingId", bookingId);
      if (!((fd.get("note") as string) || "").trim()) fd.set("note", "ชำระตอนเช็คเอาท์");
      const paymentId = await recordBookingPayment(fd);

      // โอนธนาคาร = pending — พนักงานยืนหน้าแขกเห็นเงินเข้าแล้ว → ยืนยันสลิปเลย
      if (fd.get("method") === "bank_transfer") {
        if (!perms.verify) {
          toast.info("บันทึกยอดโอนแล้ว (รอตรวจสลิป) — ต้องให้ผู้มีสิทธิ์ยืนยันก่อนเช็คเอาท์");
          await load();
          return;
        }
        const vfd = new FormData();
        vfd.set("hotelSlug", hotelSlug);
        vfd.set("paymentId", paymentId);
        vfd.set("approve", "1");
        await verifyBookingSlip(vfd);
      }

      const s = await load();
      if (s && s.balanceSatang === 0) {
        await doCheckout();
      } else if (s) {
        toast.ok(`รับเงินแล้ว — ยังค้าง ${baht(Math.max(s.balanceSatang, 0))}฿`);
      }
    } catch (e) {
      if (isNextControlFlowError(e)) throw e;
      toast.err(e instanceof Error ? e.message : "ทำรายการไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function onCheckoutOnly() {
    setBusy(true);
    try {
      await doCheckout();
    } catch (e) {
      if (isNextControlFlowError(e)) throw e;
      toast.err(e instanceof Error ? e.message : "เช็คเอาท์ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  const balance = summary?.balanceSatang ?? 0;
  const amountSatang = Math.round((Number(amount.replace(/,/g, "")) || 0) * 100);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`เช็คเอาท์ · ${code}`}
      description={guestName ?? undefined}
      maxWidth={560}
    >
      {loading || !summary ? (
        <p className="py-8 text-center text-base text-fg-muted">กำลังโหลด…</p>
      ) : (
        <div className="space-y-5">
          {/* สรุปค่าใช้จ่ายทั้งใบ (folio) */}
          <div>
            <div className="mb-1 text-base font-medium text-fg">สรุปค่าใช้จ่าย</div>
            <ul className="divide-y divide-border">
              {summary.folioItems.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-3 py-1.5">
                  <span className="min-w-0 truncate text-base text-fg">
                    {i.description}
                    {i.qty > 1 && <span className="ml-1 text-fg-muted">×{i.qty}</span>}
                  </span>
                  <span className="shrink-0 text-base tabular-nums text-fg">
                    {baht(i.totalSatang)}฿
                  </span>
                </li>
              ))}
              <li className="flex items-center justify-between gap-3 py-1.5">
                <span className="text-base text-fg-muted">ชำระแล้ว</span>
                <span className="text-base tabular-nums text-success-strong">
                  −{baht(summary.paidSatang)}฿
                </span>
              </li>
              <li className="flex items-center justify-between gap-3 py-2">
                <span className="text-base font-semibold text-fg">
                  {balance > 0 ? "ค้างชำระ" : balance < 0 ? "ชำระเกิน" : "ยอดคงเหลือ"}
                </span>
                <span
                  className={`text-lg font-semibold tabular-nums ${
                    balance > 0 ? "text-danger-strong" : "text-success-strong"
                  }`}
                >
                  {baht(Math.abs(balance))}฿
                </span>
              </li>
            </ul>
          </div>

          {balance === 0 && (
            <Button className="w-full" disabled={busy} onClick={onCheckoutOnly}>
              {busy ? "กำลังเช็คเอาท์…" : "เช็คเอาท์"}
            </Button>
          )}

          {balance < 0 && (
            <p className="rounded-md bg-warning-soft p-3 text-base text-warning-strong">
              มียอดชำระเกิน — ต้องคืนเงิน/ปรับรายการให้ยอดเป็น 0 ก่อนเช็คเอาท์
            </p>
          )}

          {balance > 0 &&
            (perms.charge ? (
              <form action={onPayAndCheckout} className="space-y-3">
                <PaymentFormFields
                  info={summary}
                  amount={amount}
                  setAmount={setAmount}
                  method={method}
                  setMethod={setMethod}
                  accountId={accountId}
                  setAccountId={setAccountId}
                />
                {method === "bank_transfer" && perms.verify && (
                  <p className="text-sm text-fg-subtle">
                    บันทึกโอนจากหน้านี้ = ยืนยันว่าเห็นยอดเงินเข้าบัญชีแล้ว
                  </p>
                )}
                <Button type="submit" disabled={busy} className="w-full">
                  {busy
                    ? "กำลังบันทึก…"
                    : amountSatang >= balance
                      ? `รับเงิน ${baht(amountSatang)}฿ และเช็คเอาท์`
                      : `รับเงิน ${baht(amountSatang)}฿ (ยังไม่ครบ — ยังไม่เช็คเอาท์)`}
                </Button>
              </form>
            ) : (
              <p className="text-base text-fg-muted">
                มียอดค้างชำระ — คุณไม่มีสิทธิ์รับเงิน (payments.charge) ให้พนักงานที่มีสิทธิ์รับเงินก่อนเช็คเอาท์
              </p>
            ))}
        </div>
      )}
    </Modal>
  );
}
