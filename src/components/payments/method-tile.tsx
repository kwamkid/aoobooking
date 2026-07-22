"use client";

import type { ComponentType } from "react";
import {
  Banknote,
  QrCode,
  Landmark,
  CreditCard,
  Globe,
  MessageCircle,
  Wallet,
  Building2,
  Ellipsis,
} from "lucide-react";
import type { Database } from "@/types/database";

/* การ์ดช่องทางชำระเงินแบบ POS — ใช้ร่วม 2 ที่:
 * payment modal (เลือกช่องทางตอนรับเงิน) + ตั้งค่า > ช่องทางชำระเงิน (เปิด/ปิด)
 * label/icon ของทุก method รวมไว้ที่นี่ที่เดียว */

export type PaymentMethod = Database["public"]["Enums"]["payment_method"];

export const METHOD_TH: Record<PaymentMethod, string> = {
  cash: "เงินสด",
  promptpay_qr: "พร้อมเพย์ QR",
  bank_transfer: "โอนธนาคาร",
  card_terminal: "บัตร (เครื่องรูด)",
  card_online: "บัตรออนไลน์",
  wechat_pay: "WeChat Pay",
  alipay: "Alipay",
  ota_collect: "OTA เก็บเงินแทน",
  other: "อื่นๆ",
};

export const METHOD_ICON: Record<
  PaymentMethod,
  ComponentType<{ size?: number | string; className?: string }>
> = {
  cash: Banknote,
  promptpay_qr: QrCode,
  bank_transfer: Landmark,
  card_terminal: CreditCard,
  card_online: Globe,
  wechat_pay: MessageCircle,
  alipay: Wallet,
  ota_collect: Building2,
  other: Ellipsis,
};

export function PayMethodTile({
  method,
  selected = false,
  dimmed = false,
  caption,
  onClick,
  disabled = false,
}: {
  method: PaymentMethod;
  /** โหมดเลือก (modal) = ช่องทางที่กดอยู่ · โหมดตั้งค่า = ช่องทางที่เปิดใช้ */
  selected?: boolean;
  /** โหมดตั้งค่า: ช่องทางที่ปิดอยู่ (จางลง แต่ยังกดเพื่อเปิดได้) */
  dimmed?: boolean;
  /** ข้อความรองใต้ชื่อ เช่น "เปิดใช้" / "ปิดอยู่" / "แนบสลิป" */
  caption?: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const Icon = METHOD_ICON[method];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={`flex flex-col items-center justify-center gap-1 rounded-lg border p-3 text-center transition-colors disabled:cursor-not-allowed ${
        selected
          ? "border-brand bg-brand-soft text-brand-strong"
          : dimmed
            ? "border-border bg-bg-subtle text-fg-subtle hover:border-border-strong"
            : "border-border bg-bg-elevated text-fg hover:border-brand hover:bg-bg-subtle"
      }`}
    >
      <Icon size={24} />
      <span className="text-base font-medium leading-tight">{METHOD_TH[method]}</span>
      {caption && (
        <span className={`text-sm leading-tight ${selected ? "text-brand-strong" : "text-fg-subtle"}`}>
          {caption}
        </span>
      )}
    </button>
  );
}
