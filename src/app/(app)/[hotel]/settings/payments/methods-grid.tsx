"use client";

import { useState } from "react";
import { ChevronDown, Pencil, Plus } from "lucide-react";
import { Badge, Button, DeleteButton, Switch, useToast } from "@/components/ui";
import { isNextControlFlowError } from "@/lib/next-error";
import { METHOD_TH, METHOD_ICON } from "@/components/payments/method-tile";
import { BankLogo } from "@/components/payments/bank-logo";
import {
  ACCOUNT_METHODS,
  type AccountMethod,
  type PaymentAccount,
  type PaymentMethod,
} from "@/lib/payment/types";
import { togglePaymentMethod, deletePaymentAccount } from "./actions";
import { AccountFormModal, accountSummary, METHOD_HINT } from "./accounts-manager";

/* ช่องทางชำระเงินแบบ list + accordion (เจ้าของขอ 2026-07-20 — เลิก modal ซ้อน modal)
 * แถวละช่องทาง: Switch เปิด/ปิดขวาสุด · 3 ช่องทางที่มีบัญชี (PromptPay/ธนาคาร/
 * เครื่องรูด) กดแถวกางลงมาเห็นบัญชีทั้งหมด + เพิ่ม/แก้/ลบ inline — ฟอร์มเป็น modal
 * ชั้นเดียว · toggle = optimistic, พลาดค่อย revert */

const METHOD_CAPTION: Partial<Record<PaymentMethod, string>> = {
  cash: "รับหน้าเคาน์เตอร์",
  ota_collect: "OTA โอนรอบบิล — บันทึกอย่างเดียว",
  card_online: "ผ่านหน้าจองออนไลน์ (เฟสถัดไป)",
  wechat_pay: "ผ่าน gateway (เฟสถัดไป)",
  alipay: "ผ่าน gateway (เฟสถัดไป)",
  other: "ช่องทางอื่นนอกเหนือรายการ",
};

function isAccountMethod(m: PaymentMethod): m is AccountMethod {
  return (ACCOUNT_METHODS as readonly string[]).includes(m);
}

export function MethodList({
  hotelSlug,
  methods,
  accounts,
  canEdit,
}: {
  hotelSlug: string;
  methods: { method: PaymentMethod; active: boolean }[];
  accounts: PaymentAccount[];
  canEdit: boolean;
}) {
  const toast = useToast();
  const [state, setState] = useState(methods);
  const [open, setOpen] = useState<AccountMethod | null>(null);
  const [editing, setEditing] = useState<{
    method: AccountMethod;
    account?: PaymentAccount;
  } | null>(null);

  async function toggle(method: PaymentMethod, next: boolean) {
    setState((s) => s.map((m) => (m.method === method ? { ...m, active: next } : m)));
    try {
      const fd = new FormData();
      fd.set("hotelSlug", hotelSlug);
      fd.set("method", method);
      fd.set("active", next ? "1" : "0");
      await togglePaymentMethod(fd);
    } catch (e) {
      if (isNextControlFlowError(e)) throw e;
      setState((s) => s.map((m) => (m.method === method ? { ...m, active: !next } : m)));
      toast.err(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    }
  }

  return (
    <>
      <ul className="divide-y divide-border">
        {state.map(({ method, active }) => {
          const Icon = METHOD_ICON[method];
          const acct = isAccountMethod(method);
          const list = accounts.filter((a) => a.method === method);
          const expanded = open === method;
          return (
            <li key={method}>
              <div className="flex items-center gap-3">
                {/* หัวแถว — ช่องทางที่มีบัญชีกดกาง accordion ได้ */}
                <button
                  type="button"
                  disabled={!acct}
                  onClick={
                    acct ? () => setOpen((o) => (o === method ? null : method)) : undefined
                  }
                  aria-expanded={acct ? expanded : undefined}
                  className="flex min-w-0 flex-1 items-center gap-3 py-3 text-left"
                >
                  <Icon
                    size={22}
                    className={`shrink-0 ${active ? "text-brand" : "text-fg-subtle"}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block text-base font-medium ${
                        active ? "text-fg" : "text-fg-subtle"
                      }`}
                    >
                      {METHOD_TH[method]}
                    </span>
                    <span className="block truncate text-sm text-fg-muted">
                      {acct
                        ? list.length === 0
                          ? "ยังไม่ได้ตั้งค่า — กดเพื่อเพิ่ม"
                          : `${list.length} ${method === "card_terminal" ? "เครื่อง" : "บัญชี"}`
                        : METHOD_CAPTION[method]}
                    </span>
                  </span>
                  {/* โลโก้ธนาคารซ้อนกันให้เห็นว่ามีแบงก์ไหนบ้าง */}
                  {method === "bank_transfer" && list.length > 0 && (
                    <span className="flex shrink-0 -space-x-1.5">
                      {list.slice(0, 5).map((a) => (
                        <BankLogo key={a.id} code={a.details.bank} size={24} />
                      ))}
                    </span>
                  )}
                  {acct && (
                    <ChevronDown
                      size={17}
                      className={`shrink-0 text-fg-muted transition-transform ${
                        expanded ? "rotate-180" : ""
                      }`}
                    />
                  )}
                </button>
                <Switch
                  checked={active}
                  disabled={!canEdit}
                  ariaLabel={`เปิด/ปิด ${METHOD_TH[method]}`}
                  onChange={(next) => toggle(method, next)}
                />
              </div>

              {/* ตัว accordion — รายการบัญชีของช่องทางนั้น + เพิ่ม/แก้/ลบ */}
              {acct && expanded && (
                <div className="space-y-2 pb-4 pl-9">
                  <p className="text-sm text-fg-subtle">{METHOD_HINT[method]}</p>
                  {list.length > 0 && (
                    <ul className="divide-y divide-border rounded-md border border-border">
                      {list.map((a) => (
                        <li
                          key={a.id}
                          className="flex items-center justify-between gap-3 px-3 py-2.5"
                        >
                          <div className="flex min-w-0 items-center gap-2.5">
                            {a.method === "bank_transfer" && (
                              <BankLogo code={a.details.bank} size={32} />
                            )}
                            <div className="min-w-0">
                              <div className="text-base font-medium text-fg">
                                {a.name}
                                {!a.active && (
                                  <span className="ml-2">
                                    <Badge tone="neutral">ปิดอยู่</Badge>
                                  </span>
                                )}
                              </div>
                              <div className="truncate text-sm text-fg-subtle">
                                {accountSummary(a)}
                              </div>
                            </div>
                          </div>
                          {canEdit && (
                            <div className="flex shrink-0 items-center gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                aria-label={`แก้ไข ${a.name}`}
                                onClick={() => setEditing({ method, account: a })}
                              >
                                <Pencil size={15} />
                              </Button>
                              <DeleteButton
                                action={deletePaymentAccount}
                                hiddenFields={{ hotelSlug, id: a.id }}
                                confirmTitle={`ลบ "${a.name}"?`}
                                confirmDescription="รายการรับเงินเก่าที่เคยอ้างถึงยังอยู่ครบ (ledger ไม่หาย)"
                                successMessage="ลบแล้ว"
                              />
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {canEdit && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setEditing({ method })}
                    >
                      <Plus size={15} className="mr-1" />
                      เพิ่ม{method === "card_terminal" ? "เครื่องรูด" : "บัญชี"}
                    </Button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {editing && (
        <AccountFormModal
          hotelSlug={hotelSlug}
          method={editing.method}
          account={editing.account}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
