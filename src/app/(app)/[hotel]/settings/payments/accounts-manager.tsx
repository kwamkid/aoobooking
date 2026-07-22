"use client";

import { useState } from "react";
import { QrCode } from "lucide-react";
import { Modal, Field, Input, Select, Button, useToast } from "@/components/ui";
import { isNextControlFlowError } from "@/lib/next-error";
import { METHOD_TH } from "@/components/payments/method-tile";
import { BankLogo } from "@/components/payments/bank-logo";
import { THAI_BANKS, bankName } from "@/lib/payment/banks";
import { promptPayPayload } from "@/lib/payment/promptpay";
import type { AccountMethod, PaymentAccount } from "@/lib/payment/types";
import { savePaymentAccount } from "./actions";
import { QRCodeSVG } from "qrcode.react";

/* ฟอร์มเพิ่ม/แก้บัญชีรับเงิน (modal ชั้นเดียว — เปิดจาก accordion ใน MethodList)
 * field เปลี่ยนตาม method · PromptPay มี QR ตัวอย่างสดให้ลองสแกนก่อนบันทึก */

export const METHOD_HINT: Record<AccountMethod, string> = {
  promptpay_qr: "ใส่เบอร์/เลขบัตรที่ผูกพร้อมเพย์ — ตอนรับเงินระบบขึ้น QR พร้อมยอดให้แขกสแกน",
  bank_transfer: "เพิ่มได้หลายบัญชี — ตอนรับเงินเลือกได้ว่าโอนเข้าบัญชีไหน",
  card_terminal: "ตั้งชื่อเครื่องรูดแต่ละเครื่อง เช่น ตามธนาคาร/เคาน์เตอร์ — เพิ่มได้หลายเครื่อง",
};

export function accountSummary(a: PaymentAccount): string {
  if (a.method === "promptpay_qr") {
    return `${a.details.id_type === "phone" ? "เบอร์" : "เลขบัตร"} ${a.details.id_value ?? ""}`;
  }
  if (a.method === "bank_transfer") {
    return `${bankName(a.details.bank)} · ${a.details.account_number ?? ""}${
      a.details.account_name ? ` · ${a.details.account_name}` : ""
    }`;
  }
  return "เครื่องรูดบัตร (EDC)";
}

export function AccountFormModal({
  hotelSlug,
  method,
  account,
  onClose,
}: {
  hotelSlug: string;
  method: AccountMethod;
  account?: PaymentAccount;
  onClose: () => void;
}) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [idType, setIdType] = useState(account?.details.id_type ?? "phone");
  const [idValue, setIdValue] = useState(account?.details.id_value ?? "");
  const [bank, setBank] = useState(account?.details.bank ?? "");

  const idDigits = idValue.replace(/\D/g, "");
  const qrReady =
    method === "promptpay_qr" &&
    (idType === "phone" ? idDigits.length === 10 : idDigits.length === 13);

  async function onSubmit(fd: FormData) {
    setSaving(true);
    try {
      await savePaymentAccount(fd);
      toast.ok("บันทึกแล้ว");
      onClose();
    } catch (e) {
      if (isNextControlFlowError(e)) throw e;
      toast.err(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`${account ? "แก้ไข" : "เพิ่ม"}${METHOD_TH[method]}`}
      description={METHOD_HINT[method]}
    >
      <form action={onSubmit} className="space-y-3">
        <input type="hidden" name="hotelSlug" value={hotelSlug} />
        <input type="hidden" name="method" value={method} />
        {account && <input type="hidden" name="id" value={account.id} />}

        <Field label={method === "card_terminal" ? "ชื่อเครื่อง" : "ชื่อเรียก (พนักงานเห็น)"}>
          <Input
            name="name"
            required
            defaultValue={account?.name}
            placeholder={
              method === "promptpay_qr"
                ? "เช่น พร้อมเพย์ร้าน"
                : method === "bank_transfer"
                  ? "เช่น KBank สาขาหลัก"
                  : "เช่น เครื่องรูด เคาน์เตอร์ 1"
            }
            className="w-full"
          />
        </Field>

        {method === "promptpay_qr" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="ผูกพร้อมเพย์ด้วย">
                <Select
                  name="idType"
                  value={idType}
                  onChange={(v) => setIdType(v as "phone" | "citizen_id")}
                  options={[
                    { value: "phone", label: "เบอร์มือถือ" },
                    { value: "citizen_id", label: "เลขบัตรประชาชน" },
                  ]}
                  className="w-full"
                />
              </Field>
              <Field label={idType === "phone" ? "เบอร์มือถือ (10 หลัก)" : "เลขบัตร (13 หลัก)"}>
                <Input
                  name="idValue"
                  required
                  inputMode="numeric"
                  value={idValue}
                  onChange={(e) => setIdValue(e.target.value)}
                  className="w-full"
                />
              </Field>
            </div>
            {qrReady && (
              <div className="flex items-center gap-3 rounded-md bg-bg-subtle p-3">
                <div className="rounded-sm bg-white p-2">
                  <QRCodeSVG
                    value={promptPayPayload({ idType, idValue: idDigits })}
                    size={96}
                  />
                </div>
                <p className="text-sm text-fg-muted">
                  <QrCode size={15} className="mr-1 inline" />
                  QR ตัวอย่าง (ไม่ระบุยอด) — ลองสแกนเช็คชื่อบัญชีก่อนบันทึก
                </p>
              </div>
            )}
          </>
        )}

        {method === "bank_transfer" && (
          <>
            <Field label="ธนาคาร">
              <Select
                name="bank"
                value={bank}
                onChange={setBank}
                options={THAI_BANKS.map((b) => ({
                  value: b.code,
                  label: b.name,
                  icon: <BankLogo code={b.code} size={26} />,
                }))}
                placeholder="— เลือกธนาคาร —"
                className="w-full"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="เลขบัญชี">
                <Input
                  name="accountNumber"
                  required
                  defaultValue={account?.details.account_number}
                  className="w-full"
                />
              </Field>
              <Field label="ชื่อบัญชี">
                <Input
                  name="accountName"
                  defaultValue={account?.details.account_name}
                  className="w-full"
                />
              </Field>
            </div>
          </>
        )}

        <label className="flex items-center gap-2 text-base text-fg">
          <input type="checkbox" name="active" value="1" defaultChecked={account?.active ?? true} />
          เปิดใช้งาน
        </label>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "กำลังบันทึก…" : "บันทึก"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
