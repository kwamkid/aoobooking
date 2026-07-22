import type { Database } from "@/types/database";

export type PaymentMethod = Database["public"]["Enums"]["payment_method"];

/** method ที่ตั้ง "บัญชีรับเงิน" ได้ (PromptPay / ธนาคาร / เครื่องรูด) */
export const ACCOUNT_METHODS = ["promptpay_qr", "bank_transfer", "card_terminal"] as const;
export type AccountMethod = (typeof ACCOUNT_METHODS)[number];

export type PaymentAccountDetails = {
  // promptpay_qr
  id_type?: "phone" | "citizen_id";
  id_value?: string;
  // bank_transfer
  bank?: string;
  account_number?: string;
  account_name?: string;
};

export type PaymentAccount = {
  id: string;
  method: AccountMethod;
  name: string;
  details: PaymentAccountDetails;
  active: boolean;
};
