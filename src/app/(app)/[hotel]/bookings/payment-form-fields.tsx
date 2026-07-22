"use client";

import { Field, Input } from "@/components/ui";
import { PayMethodTile, type PaymentMethod } from "@/components/payments/method-tile";
import { BankLogo } from "@/components/payments/bank-logo";
import { promptPayPayload } from "@/lib/payment/promptpay";
import { bankName } from "@/lib/payment/banks";
import { QRCodeSVG } from "qrcode.react";
import type { BookingPaymentInfo } from "./payment-actions";

/* ฟอร์มรับเงิน (ใช้ร่วม PaymentModal + CheckoutModal) — จำนวนเงิน + การ์ด POS
 * + เลือกบัญชี/เครื่อง + PromptPay QR ตามยอดสด + กล่องเลขบัญชีโอน + สลิป + โน้ต
 * field name ตรงกับ recordBookingPayment: amount / method / accountId / slip / note */

export function PaymentFormFields({
  info,
  amount,
  setAmount,
  method,
  setMethod,
  accountId,
  setAccountId,
}: {
  info: BookingPaymentInfo;
  amount: string;
  setAmount: (v: string) => void;
  method: PaymentMethod;
  setMethod: (m: PaymentMethod) => void;
  accountId: string | null;
  setAccountId: (id: string) => void;
}) {
  const methodAccounts = info.accounts.filter((a) => a.method === method);
  const selectedAccount =
    methodAccounts.find((a) => a.id === accountId) ?? methodAccounts[0] ?? null;
  const amountSatang = Math.round((Number(amount.replace(/,/g, "")) || 0) * 100);

  return (
    <>
      <Field label="จำนวนเงิน (บาท)">
        <Input
          name="amount"
          type="number"
          step="0.01"
          min="0.01"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full"
        />
      </Field>

      {/* ช่องทาง = การ์ดแบบ POS — เฉพาะที่เปิดใน ตั้งค่า > ช่องทางชำระเงิน */}
      <Field label="ช่องทาง">
        <input type="hidden" name="method" value={method} />
        <input type="hidden" name="accountId" value={selectedAccount?.id ?? ""} />
        {info.methods.length === 0 ? (
          <p className="text-base text-fg-muted">
            ยังไม่เปิดช่องทางชำระเงิน — เปิดได้ที่ ตั้งค่า &gt; ช่องทางชำระเงิน
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {info.methods.map((m) => (
              <PayMethodTile
                key={m}
                method={m}
                selected={method === m}
                caption={m === "bank_transfer" ? "แนบสลิป" : undefined}
                onClick={() => setMethod(m)}
              />
            ))}
          </div>
        )}
      </Field>

      {/* เลือกบัญชี/เครื่อง — มี >1 ค่อยโชว์ปุ่มเลือก */}
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

      {/* PromptPay → QR สดตามยอดที่กรอก ให้แขกสแกนได้เลย */}
      {method === "promptpay_qr" &&
        selectedAccount?.details.id_type &&
        selectedAccount.details.id_value && (
          <div className="flex items-center gap-4 rounded-md bg-bg-subtle p-3">
            <div className="shrink-0 rounded-sm bg-white p-2">
              <QRCodeSVG
                value={promptPayPayload({
                  idType: selectedAccount.details.id_type,
                  idValue: selectedAccount.details.id_value,
                  amountSatang: amountSatang > 0 ? amountSatang : undefined,
                })}
                size={128}
              />
            </div>
            <div className="text-base text-fg">
              <div className="font-medium">{selectedAccount.name}</div>
              <div className="tabular-nums">
                {amountSatang > 0
                  ? `ยอด ${(amountSatang / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 })}฿`
                  : "ไม่ระบุยอด (แขกกรอกเอง)"}
              </div>
              <div className="mt-1 text-sm text-fg-muted">ให้แขกสแกนจ่าย แล้วกดบันทึกรับเงิน</div>
            </div>
          </div>
        )}

      {/* โอนธนาคาร → โชว์โลโก้+เลขบัญชีที่เลือก บอกแขกได้ทันที */}
      {method === "bank_transfer" && selectedAccount?.details.account_number && (
        <div className="flex items-center gap-3 rounded-md bg-bg-subtle p-3 text-base text-fg">
          <BankLogo code={selectedAccount.details.bank} size={36} />
          <div className="min-w-0">
            <div className="font-medium">
              {bankName(selectedAccount.details.bank)}
              <span className="ml-2 tabular-nums">{selectedAccount.details.account_number}</span>
            </div>
            {selectedAccount.details.account_name && (
              <div className="truncate text-sm text-fg-muted">
                {selectedAccount.details.account_name}
              </div>
            )}
          </div>
        </div>
      )}

      {method === "bank_transfer" && (
        <Field label="สลิปโอน (รูปภาพ)" hint="โอนธนาคารจะขึ้น “รอตรวจสลิป” จนกว่าจะกดยืนยัน">
          <input
            type="file"
            name="slip"
            accept="image/*"
            className="block w-full text-base text-fg file:mr-3 file:rounded-sm file:border-0 file:bg-bg-subtle file:px-3 file:py-1.5 file:text-base file:text-fg"
          />
        </Field>
      )}

      <Field label="บันทึกเพิ่มเติม">
        <Input name="note" placeholder="เช่น มัดจำ 1 คืน" className="w-full" />
      </Field>
    </>
  );
}
