"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal, Input, Button, Badge, useToast } from "@/components/ui";
import { isNextControlFlowError } from "@/lib/next-error";
import { METHOD_TH, type PaymentMethod } from "@/components/payments/method-tile";
import { BankLogo } from "@/components/payments/bank-logo";
import type { PaymentAccount } from "@/lib/payment/types";
import { PaymentFormFields } from "./payment-form-fields";
import {
  confirmRefundPayment,
  getBookingPayments,
  recordBookingPayment,
  refundBookingPayment,
  verifyBookingSlip,
  voidBookingPayment,
  type BookingPaymentInfo,
} from "./payment-actions";

/* Payment modal — ประวัติทุก transaction (ledger) + ฟอร์มรับเงินเพิ่ม
 * เปิดจากหน้า list การจอง · ช่องทาง = การ์ด POS (เฉพาะที่เปิดใน ตั้งค่า > ช่องทางชำระเงิน)
 * โอน+แนบสลิป = รอ verify · เงินสด/บัตร/QR = สำเร็จทันที */

const STATUS_TH: Record<string, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  pending: { label: "รอตรวจสลิป", tone: "warning" },
  confirmed: { label: "สำเร็จ", tone: "success" },
  failed: { label: "ปฏิเสธ", tone: "danger" },
  voided: { label: "โมฆะ", tone: "neutral" },
};

function baht(satang: number): string {
  return (satang / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 });
}
function fmtWhen(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export type PaymentPerms = {
  charge: boolean;
  verify: boolean;
  voidPay: boolean;
  refund: boolean;
};

export function PaymentModal({
  open,
  onClose,
  hotelSlug,
  bookingId,
  bookingCode,
  guestName,
  bookingStatus,
  perms,
}: {
  open: boolean;
  onClose: () => void;
  hotelSlug: string;
  bookingId: string;
  bookingCode: string;
  guestName: string | null;
  bookingStatus: string;
  perms: PaymentPerms;
}) {
  const router = useRouter();
  const toast = useToast();
  const [info, setInfo] = useState<BookingPaymentInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  // จำนวนเงินเป็น controlled state — ใช้สร้าง QR PromptPay ตามยอดที่กรอกสด
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState<string | null>(null);
  // แถวที่กำลังจะ void — เปิดช่องกรอกเหตุผล inline ใต้รายการนั้น
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState("");
  // แถว charge ที่กำลังคืนเงิน / แถว refund pending ที่กำลังยืนยันคืนจริง
  const [refundingId, setRefundingId] = useState<string | null>(null);
  const [confirmRefundId, setConfirmRefundId] = useState<string | null>(null);
  const [refundSaving, setRefundSaving] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getBookingPayments(hotelSlug, bookingId);
      setInfo(data);
      // default = ช่องทางแรกที่โรงแรมเปิด (เรียง sort_order — ปกติเงินสด)
      setMethod((m) => (data.methods.includes(m) ? m : (data.methods[0] ?? "cash")));
      // จำนวนเงินตั้งต้น = ยอดค้าง (แก้เองได้ — จ่ายมัดจำ/บางส่วน)
      setAmount(data.balanceSatang > 0 ? String(data.balanceSatang / 100) : "");
    } catch (e) {
      if (isNextControlFlowError(e)) throw e;
      toast.err(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
    // toast จาก provider — อ้างอิงคงที่ ไม่ต้องใส่ dep
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotelSlug, bookingId]);

  useEffect(() => {
    if (open) {
      setMethod("cash");
      load();
    } else {
      setInfo(null);
      setVoidingId(null);
      setVoidReason("");
      setRefundingId(null);
      setConfirmRefundId(null);
    }
  }, [open, load]);

  // รับเงินเพิ่มได้เฉพาะการจองที่ยังไม่จบ (เช็คเอาท์แล้ว balance = 0 อยู่แล้ว)
  const canRecord =
    perms.charge && ["pending", "confirmed", "checked_in"].includes(bookingStatus);

  async function onRecord(fd: FormData) {
    setSaving(true);
    try {
      await recordBookingPayment(fd);
      toast.ok(
        fd.get("method") === "bank_transfer"
          ? "บันทึกแล้ว — รอตรวจสลิปเพื่อยืนยันยอด"
          : "บันทึกการชำระแล้ว",
      );
      formRef.current?.reset();
      setMethod("cash");
      await load();
      router.refresh(); // อัปเดตยอดชำระ/ค้าง ในตารางหลัง modal ปิด
    } catch (e) {
      if (isNextControlFlowError(e)) throw e;
      toast.err(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function onVerify(paymentId: string, approve: boolean) {
    try {
      const fd = new FormData();
      fd.set("hotelSlug", hotelSlug);
      fd.set("paymentId", paymentId);
      fd.set("approve", approve ? "1" : "0");
      await verifyBookingSlip(fd);
      toast.ok(approve ? "ยืนยันสลิปแล้ว" : "ปฏิเสธสลิปแล้ว");
      await load();
      router.refresh();
    } catch (e) {
      if (isNextControlFlowError(e)) throw e;
      toast.err(e instanceof Error ? e.message : "ทำรายการไม่สำเร็จ");
    }
  }

  // บันทึกผิด → void (ตีเป็นโมฆะ — แถวยังอยู่ + เหตุผล + audit) แล้วบันทึกใหม่
  async function onVoid(paymentId: string) {
    try {
      const fd = new FormData();
      fd.set("hotelSlug", hotelSlug);
      fd.set("paymentId", paymentId);
      fd.set("reason", voidReason);
      await voidBookingPayment(fd);
      toast.ok("ตีรายการเป็นโมฆะแล้ว — บันทึกรายการใหม่ให้ถูกต้องได้เลย");
      setVoidingId(null);
      setVoidReason("");
      await load();
      router.refresh();
    } catch (e) {
      if (isNextControlFlowError(e)) throw e;
      toast.err(e instanceof Error ? e.message : "ทำรายการไม่สำเร็จ");
    }
  }

  // คืนเงินจากแถวรับ (charge confirmed) — บันทึกในระบบ คืนจริงนอกระบบ (§14.7)
  async function onRefund(chargeId: string, v: RefundFormValues) {
    setRefundSaving(true);
    try {
      const fd = new FormData();
      fd.set("hotelSlug", hotelSlug);
      fd.set("paymentId", chargeId);
      fd.set("amount", v.amountBaht);
      fd.set("method", v.method);
      if (v.accountId) fd.set("accountId", v.accountId);
      if (v.note) fd.set("note", v.note);
      await refundBookingPayment(fd);
      toast.ok("บันทึกคืนเงินแล้ว");
      setRefundingId(null);
      await load();
      router.refresh();
    } catch (e) {
      if (isNextControlFlowError(e)) throw e;
      toast.err(e instanceof Error ? e.message : "ทำรายการไม่สำเร็จ");
    } finally {
      setRefundSaving(false);
    }
  }

  // ยืนยันคืนจริงของ refund pending (ระบบสร้างตอน cancel/no-show) + จดวิธีคืน
  async function onConfirmRefund(refundId: string, v: RefundFormValues) {
    setRefundSaving(true);
    try {
      const fd = new FormData();
      fd.set("hotelSlug", hotelSlug);
      fd.set("paymentId", refundId);
      fd.set("method", v.method);
      if (v.accountId) fd.set("accountId", v.accountId);
      if (v.note) fd.set("note", v.note);
      await confirmRefundPayment(fd);
      toast.ok("ยืนยันการคืนเงินแล้ว");
      setConfirmRefundId(null);
      await load();
      router.refresh();
    } catch (e) {
      if (isNextControlFlowError(e)) throw e;
      toast.err(e instanceof Error ? e.message : "ทำรายการไม่สำเร็จ");
    } finally {
      setRefundSaving(false);
    }
  }

  const balance = info ? info.balanceSatang : 0;

  // ยอดที่ยังคืนได้ต่อ charge = ยอดรับ − refund ที่ชี้กลับ (pending+confirmed)
  const refundedByCharge = new Map<string, number>();
  if (info) {
    for (const p of info.payments) {
      if (
        p.direction === "refund" &&
        p.reference_payment_id &&
        (p.status === "pending" || p.status === "confirmed")
      ) {
        refundedByCharge.set(
          p.reference_payment_id,
          (refundedByCharge.get(p.reference_payment_id) ?? 0) + p.amount_satang,
        );
      }
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`การชำระเงิน · ${bookingCode}`}
      description={guestName ?? undefined}
      maxWidth={560}
    >
      {loading || !info ? (
        <p className="py-8 text-center text-base text-fg-muted">กำลังโหลด…</p>
      ) : (
        <div className="space-y-5">
          {/* สรุปยอด — realtime จาก ledger (confirmed เท่านั้น) */}
          <div className="grid grid-cols-3 gap-2 rounded-md bg-bg-subtle p-3 text-center">
            <div>
              <div className="text-sm text-fg-muted">ยอดรวม</div>
              <div className="text-base font-semibold tabular-nums text-fg">
                {baht(info.totalSatang)}฿
              </div>
            </div>
            <div>
              <div className="text-sm text-fg-muted">ชำระแล้ว</div>
              <div className="text-base font-semibold tabular-nums text-success-strong">
                {baht(info.paidSatang)}฿
              </div>
            </div>
            <div>
              <div className="text-sm text-fg-muted">{balance >= 0 ? "ค้างชำระ" : "ชำระเกิน"}</div>
              <div
                className={`text-base font-semibold tabular-nums ${
                  balance > 0 ? "text-danger-strong" : "text-success-strong"
                }`}
              >
                {baht(Math.abs(balance))}฿
              </div>
            </div>
          </div>

          {/* ฟอร์มรับเงินเพิ่ม */}
          {canRecord && (
            <form ref={formRef} action={onRecord} className="space-y-3">
              <input type="hidden" name="hotelSlug" value={hotelSlug} />
              <input type="hidden" name="bookingId" value={bookingId} />
              <PaymentFormFields
                info={info}
                amount={amount}
                setAmount={setAmount}
                method={method}
                setMethod={setMethod}
                accountId={accountId}
                setAccountId={setAccountId}
              />
              <Button type="submit" disabled={saving || info.methods.length === 0} className="w-full">
                {saving ? "กำลังบันทึก…" : "บันทึกรับเงิน"}
              </Button>
            </form>
          )}

          {/* ประวัติทุก transaction — ledger ไม่แก้ทับ (refund = แถวใหม่ติดลบ) */}
          <div>
            <div className="mb-2 text-base font-medium text-fg">
              ประวัติการชำระ ({info.payments.length})
            </div>
            {info.payments.length === 0 ? (
              <p className="text-base text-fg-muted">ยังไม่มีการชำระเงิน</p>
            ) : (
              <ul className="divide-y divide-border">
                {info.payments.map((p) => {
                  // refund pending = รอโรงแรมคืนเงินจริง (ไม่ใช่รอตรวจสลิป)
                  const st =
                    p.direction === "refund" && p.status === "pending"
                      ? { label: "รอคืนเงิน", tone: "warning" as const }
                      : (STATUS_TH[p.status] ?? { label: p.status, tone: "neutral" as const });
                  const refundable =
                    p.direction === "charge" && p.status === "confirmed"
                      ? p.amount_satang - (refundedByCharge.get(p.id) ?? 0)
                      : 0;
                  return (
                    <li key={p.id} className="flex items-start justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <div className="text-base text-fg">
                          {p.direction === "refund" ? "คืนเงิน · " : ""}
                          {METHOD_TH[p.method] ?? p.method}
                          <span className="ml-2">
                            <Badge tone={st.tone}>{st.label}</Badge>
                          </span>
                        </div>
                        <div className="text-sm text-fg-subtle">
                          {fmtWhen(p.created_at)}
                          {p.account_name && <span className="ml-2">· {p.account_name}</span>}
                          {p.note && <span className="ml-2">· {p.note}</span>}
                          {p.slip_url && (
                            <a
                              href={p.slip_url}
                              target="_blank"
                              rel="noreferrer"
                              className="ml-2 text-info-strong underline"
                            >
                              ดูสลิป
                            </a>
                          )}
                        </div>
                        {p.status === "voided" && p.void_reason && (
                          <div className="text-sm text-fg-subtle">เหตุผล: {p.void_reason}</div>
                        )}
                        {p.status === "pending" && p.method === "bank_transfer" && perms.verify && (
                          <div className="mt-1.5 flex gap-2">
                            <Button size="sm" onClick={() => onVerify(p.id, true)}>
                              ยืนยันสลิป
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-danger-strong"
                              onClick={() => onVerify(p.id, false)}
                            >
                              ปฏิเสธ
                            </Button>
                          </div>
                        )}
                        {/* refund pending (จาก cancel/no-show) → ยืนยันคืนจริง + จดวิธีคืน */}
                        {p.direction === "refund" &&
                          p.status === "pending" &&
                          perms.refund &&
                          (confirmRefundId === p.id ? (
                            <RefundInlineForm
                              maxSatang={p.amount_satang}
                              showAmount={false}
                              methods={info.methods}
                              accounts={info.accounts}
                              submitLabel="ยืนยันว่าคืนแล้ว"
                              saving={refundSaving}
                              onSubmit={(v) => onConfirmRefund(p.id, v)}
                              onCancel={() => setConfirmRefundId(null)}
                            />
                          ) : (
                            <div className="mt-1.5">
                              <Button
                                size="sm"
                                onClick={() => {
                                  setConfirmRefundId(p.id);
                                  setRefundingId(null);
                                  setVoidingId(null);
                                }}
                              >
                                บันทึกว่าคืนเงินแล้ว
                              </Button>
                            </div>
                          ))}
                        {/* คืนเงินจากแถวรับที่สำเร็จ — อ้างอิงก้อนนี้ คืนรวมห้ามเกิน */}
                        {refundable > 0 && perms.refund && refundingId === p.id && (
                          <RefundInlineForm
                            maxSatang={refundable}
                            showAmount
                            methods={info.methods}
                            accounts={info.accounts}
                            submitLabel="ยืนยันคืนเงิน"
                            saving={refundSaving}
                            onSubmit={(v) => onRefund(p.id, v)}
                            onCancel={() => setRefundingId(null)}
                          />
                        )}
                        {refundable > 0 && perms.refund && refundingId !== p.id && (
                          <button
                            type="button"
                            onClick={() => {
                              setRefundingId(p.id);
                              setConfirmRefundId(null);
                              setVoidingId(null);
                            }}
                            className="mr-3 mt-1 text-sm text-info-strong underline-offset-2 hover:underline"
                          >
                            คืนเงิน
                          </button>
                        )}
                        {/* บันทึกผิด → void ได้เฉพาะรายการที่มีผลแล้ว (pending โอนใช้ปุ่มปฏิเสธ)
                         * รวม refund pending ที่ตกลงไม่คืนแล้ว → ตีเป็นโมฆะได้เช่นกัน */}
                        {(p.status === "confirmed" ||
                          (p.direction === "refund" && p.status === "pending")) &&
                          perms.voidPay &&
                          (voidingId === p.id ? (
                            <div className="mt-1.5 space-y-1.5">
                              <Input
                                value={voidReason}
                                onChange={(e) => setVoidReason(e.target.value)}
                                placeholder="เหตุผล เช่น กรอกยอดผิด"
                                className="w-full"
                                autoFocus
                              />
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="danger"
                                  disabled={!voidReason.trim()}
                                  onClick={() => onVoid(p.id)}
                                >
                                  ยืนยันตีเป็นโมฆะ
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setVoidingId(null);
                                    setVoidReason("");
                                  }}
                                >
                                  ไม่ใช่
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setVoidingId(p.id);
                                setVoidReason("");
                                setRefundingId(null);
                                setConfirmRefundId(null);
                              }}
                              className="mt-1 text-sm text-danger-strong underline-offset-2 hover:underline"
                            >
                              {p.direction === "refund" && p.status === "pending"
                                ? "ไม่คืนแล้ว? ตีเป็นโมฆะ"
                                : "บันทึกผิด? ตีเป็นโมฆะ"}
                            </button>
                          ))}
                      </div>
                      <div
                        className={`shrink-0 text-base font-medium tabular-nums ${
                          p.status === "voided" || p.status === "failed"
                            ? "text-fg-subtle line-through"
                            : p.direction === "refund"
                              ? "text-danger-strong"
                              : p.status === "confirmed"
                                ? "text-fg"
                                : "text-fg-muted"
                        }`}
                      >
                        {p.direction === "refund" ? "−" : "+"}
                        {baht(p.amount_satang)}฿
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ── ฟอร์มคืนเงิน inline ใต้แถว (ไม่เอา modal ซ้อน modal) — ใช้ 3 ที่:
 * คืนจากแถว charge (กรอกยอดได้ ไม่เกินที่เหลือ) · ยืนยัน refund pending (ยอดตายตัว)
 * · checkout modal เคสชำระเกิน (import ไปใช้ — คืนส่วนเกินให้ยอดเป็น 0)
 * วิธีคืน = pill ต่อช่องทาง (ช่องทางที่โรงแรมเปิด + อื่นๆ) ไม่ใช้ dropdown ── */

export type RefundFormValues = {
  amountBaht: string;
  method: PaymentMethod;
  accountId: string | null;
  note: string;
};

export function RefundInlineForm({
  maxSatang,
  showAmount,
  methods,
  accounts,
  submitLabel,
  saving,
  onSubmit,
  onCancel,
}: {
  /** เพดานที่คืนได้ (charge: ยอดคงเหลือ · pending refund: ยอดของแถว) */
  maxSatang: number;
  showAmount: boolean;
  methods: PaymentMethod[];
  accounts: PaymentAccount[];
  submitLabel: string;
  saving: boolean;
  onSubmit: (v: RefundFormValues) => void;
  /** ไม่ส่ง = ฟอร์มถาวร (ไม่มีปุ่ม "ไม่ใช่" — เช่นใน checkout modal) */
  onCancel?: () => void;
}) {
  // วิธีคืนอาจไม่ตรงช่องทางรับ (รับ QR แต่คืนสด) → เติม "อื่นๆ" ไว้เสมอ
  const refundMethods: PaymentMethod[] = [
    ...new Set<PaymentMethod>([
      ...(methods.length ? methods : (["cash", "bank_transfer"] as PaymentMethod[])),
      "other",
    ]),
  ];
  const [amount, setAmount] = useState(String(maxSatang / 100));
  const [method, setMethod] = useState<PaymentMethod>(refundMethods[0]);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const methodAccounts = accounts.filter((a) => a.method === method);
  const selectedAccount = methodAccounts.find((a) => a.id === accountId) ?? methodAccounts[0] ?? null;
  const amountSatang = Math.round((Number(amount.replace(/,/g, "")) || 0) * 100);
  const amountOk = !showAmount || (amountSatang > 0 && amountSatang <= maxSatang);

  return (
    <div className="mt-1.5 space-y-2 rounded-md bg-bg-subtle p-2.5">
      {showAmount && (
        <div className="flex items-center gap-2">
          <Input
            type="number"
            step="0.01"
            min="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-32"
            autoFocus
          />
          <span className="text-sm text-fg-muted">
            คืนได้ไม่เกิน {baht(maxSatang)}฿
          </span>
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {refundMethods.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMethod(m);
              setAccountId(null);
            }}
            className={`rounded-full border px-3 py-1 text-sm transition-colors ${
              method === m
                ? "border-brand bg-brand-soft text-brand-strong"
                : "border-border text-fg-muted hover:border-brand"
            }`}
          >
            {METHOD_TH[m]}
          </button>
        ))}
      </div>
      {methodAccounts.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {methodAccounts.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setAccountId(a.id)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors ${
                selectedAccount?.id === a.id
                  ? "border-brand bg-brand-soft text-brand-strong"
                  : "border-border text-fg-muted hover:border-brand"
              }`}
            >
              {a.method === "bank_transfer" && <BankLogo code={a.details.bank} size={16} />}
              {a.name}
            </button>
          ))}
        </div>
      )}
      <Input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="หมายเหตุ เช่น คืนส่วนที่ชำระเกิน"
        className="w-full"
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={saving || !amountOk}
          onClick={() =>
            onSubmit({
              amountBaht: amount,
              method,
              accountId: selectedAccount?.id ?? null,
              note: note.trim(),
            })
          }
        >
          {saving ? "กำลังบันทึก…" : submitLabel}
        </Button>
        {onCancel && (
          <Button size="sm" variant="ghost" onClick={onCancel}>
            ไม่ใช่
          </Button>
        )}
      </div>
    </div>
  );
}
