"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import type { Database } from "@/types/database";
import { MoreHorizontal } from "lucide-react";
import { hotelHref } from "@/lib/hotel/href";
import {
  DataTable,
  type DataTableColumn,
  Badge,
  BOOKING_STATUS_TONE,
  Popover,
  RoomBadge,
  useConfirm,
  useToast,
} from "@/components/ui";
import { isNextControlFlowError } from "@/lib/next-error";
import { confirmBooking, cancelBooking } from "./actions";
import { PaymentModal } from "./payment-modal";
import { CheckoutModal } from "./checkout-modal";
import { CheckInModal } from "./checkin-modal";

/* ตารางการจอง — DataTable shared (rules #20: server pagination → pagination={false}
 * ให้ PaginationNav ฝั่งหน้าเป็นคนแบ่ง) + action menu ต่อแถว
 * ทุก action ผ่าน server action ที่ลง audit log (ใครทำอะไร old→new ดูได้ใน
 * ตั้งค่า > บันทึกกิจกรรม) */

type Row = Database["public"]["Functions"]["search_bookings"]["Returns"][number];

const STATUS_TH: Record<string, string> = {
  pending: "รอยืนยัน",
  confirmed: "ยืนยันแล้ว",
  checked_in: "เข้าพักอยู่",
  checked_out: "เช็คเอาท์แล้ว",
  cancelled: "ยกเลิก",
  no_show: "ไม่มาเข้าพัก",
};


function thStay(checkIn: string, checkOut: string): string {
  const a = new Date(checkIn + "T00:00:00Z");
  const b = new Date(checkOut + "T00:00:00Z");
  const opts = { month: "short", year: "2-digit", timeZone: "UTC" } as const;
  const dayA = a.toLocaleDateString("th-TH", { day: "numeric", timeZone: "UTC" });
  const full = (d: Date) => d.toLocaleDateString("th-TH", { day: "numeric", ...opts });
  return a.getUTCMonth() === b.getUTCMonth() && a.getUTCFullYear() === b.getUTCFullYear()
    ? `${dayA}–${full(b)}`
    : `${full(a)} – ${full(b)}`;
}
function nightsOf(checkIn: string, checkOut: string): number {
  return Math.round(
    (new Date(checkOut + "T00:00:00Z").getTime() -
      new Date(checkIn + "T00:00:00Z").getTime()) /
      86400000,
  );
}
function fmtSlash(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}
/** เวลาเช็คอิน/เอาท์จริง แบบสั้น "23 ก.ค. 10:04" (เวลาท้องถิ่นเครื่องผู้ใช้) */
function fmtCheckTime(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("th-TH", { day: "numeric", month: "short" })} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export type BookingActionPerms = {
  edit: boolean;
  cancel: boolean;
  checkin: boolean;
  checkout: boolean;
  payView: boolean;
  payCharge: boolean;
  payVerify: boolean;
  payVoid: boolean;
  payRefund: boolean;
};

export function BookingsTable({
  rows,
  hotelSlug,
  today,
  perms,
}: {
  rows: Row[];
  hotelSlug: string;
  today: string;
  perms: BookingActionPerms;
}) {
  const columns: DataTableColumn<Row>[] = [
    {
      // เลขจองของเรา = ลิงก์เข้าหน้ารายละเอียดการจอง · จองจาก OTA มี 2 เลข
      // (BK ของเรา + เลขอ้างอิงของ OTA) — โชว์เลข OTA บรรทัดรองเมื่อมี
      key: "code",
      header: "การจอง",
      sortable: true,
      render: (b) => (
        <>
          <Link
            href={hotelHref(`/bookings/${b.id}`, hotelSlug)}
            className="font-mono font-medium text-info-strong underline-offset-2 hover:underline"
          >
            {b.code}
          </Link>
          {b.ota_reference && (
            <div className="text-sm text-fg-subtle">OTA: {b.ota_reference}</div>
          )}
        </>
      ),
    },
    {
      key: "guest_name",
      header: "แขก",
      sortable: true,
      render: (b) => (
        <>
          {/* ชื่อแขก = ลิงก์โปรไฟล์ลูกค้า (ประวัติ/เอกสาร) — เข้า booking ใช้เลขจอง */}
          {b.guest_id ? (
            <Link
              href={hotelHref(`/guests/${b.guest_id}`, hotelSlug)}
              className="font-medium text-info-strong underline-offset-2 hover:underline"
            >
              {b.guest_name ?? "ไม่ระบุชื่อ"}
            </Link>
          ) : (
            <div className="font-medium text-fg">{b.guest_name ?? "ไม่ระบุชื่อ"}</div>
          )}
          {b.guest_phone && <div className="text-sm text-fg-subtle">{b.guest_phone}</div>}
        </>
      ),
    },
    {
      key: "check_in",
      header: "เข้าพัก",
      sortable: true,
      render: (b) => (
        <div>
          <span className="whitespace-nowrap">
            {/* เบอร์ห้อง (มีเมื่อเช็คอิน/assign แล้ว) นำหน้าวันที่ */}
            {b.room_numbers && (
              <span className="mr-2">
                <RoomBadge rooms={b.room_numbers} size="sm" />
              </span>
            )}
            <span className="tabular-nums text-fg">{thStay(b.check_in, b.check_out)}</span>
            <span className="ml-2 text-sm text-fg-muted">
              {nightsOf(b.check_in, b.check_out)} คืน
            </span>
            {b.check_in === today &&
              (b.status === "pending" || b.status === "confirmed") && (
                <span className="ml-2">
                  <Badge tone="brand">เข้าวันนี้</Badge>
                </span>
              )}
            {b.check_out === today && b.status === "checked_in" && (
              <span className="ml-2">
                <Badge tone="warning">ออกวันนี้</Badge>
              </span>
            )}
          </span>
          {/* เวลาเช็คอิน/เอาท์จริง — เห็นทันทีว่าแขกมาช้ากว่าวันที่จอง (เคส 22–23 มา 23) */}
          {b.checked_in_at && (
            <div className="mt-0.5 whitespace-nowrap text-sm tabular-nums text-fg-subtle">
              เช็คอิน {fmtCheckTime(b.checked_in_at)}
              {b.checked_out_at && <> · เช็คเอาท์ {fmtCheckTime(b.checked_out_at)}</>}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "created_at",
      header: "จองเมื่อ",
      sortable: true,
      render: (b) => (
        <span className="whitespace-nowrap tabular-nums text-fg-muted">
          {fmtSlash(b.created_at)}
        </span>
      ),
    },
    {
      key: "status",
      header: "สถานะ",
      render: (b) => (
        <Badge tone={BOOKING_STATUS_TONE[b.status] ?? "neutral"}>
          {STATUS_TH[b.status] ?? b.status}
        </Badge>
      ),
    },
    {
      key: "total_satang",
      header: "ยอด",
      align: "right",
      sortable: true,
      render: (b) => <PaymentCell booking={b} hotelSlug={hotelSlug} perms={perms} />,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      width: 56,
      render: (b) => <RowActions booking={b} hotelSlug={hotelSlug} perms={perms} />,
    },
  ];

  return (
    <DataTable columns={columns} data={rows} keyField="id" pagination={false} />
  );
}

/* ── ช่องยอดเงิน — กดที่บรรทัดชำระ/ค้าง เปิด payment modal (ประวัติ + รับเงินเพิ่ม)
 * แสดงยอดจาก search_bookings (confirmed เท่านั้น) · modal โหลดยอดสดอีกทีตอนเปิด ── */
function PaymentCell({
  booking: b,
  hotelSlug,
  perms,
}: {
  booking: Row;
  hotelSlug: string;
  perms: BookingActionPerms;
}) {
  const [open, setOpen] = useState(false);
  const closed = b.status === "cancelled" || b.status === "no_show";
  // ยอดจริง = folio ทั้งใบ (ค่าห้อง + ค่าอาหาร/อื่นๆ) จาก search_bookings v3
  const charges = b.charges_satang ?? b.total_satang;

  const paidLine = closed ? null : b.paid_satang >= charges ? (
    <span className="text-success-strong">ชำระครบ</span>
  ) : b.paid_satang > 0 ? (
    <>
      <span className="text-success-strong">
        ชำระ {(b.paid_satang / 100).toLocaleString("th-TH")}
      </span>
      <span className="text-danger-strong">
        {" · ค้าง "}
        {((charges - b.paid_satang) / 100).toLocaleString("th-TH")}
      </span>
    </>
  ) : (
    <span className="text-danger-strong">
      ค้าง {(charges / 100).toLocaleString("th-TH")}
    </span>
  );

  return (
    <>
      <div className="font-medium tabular-nums text-fg">
        {(charges / 100).toLocaleString("th-TH")}฿
      </div>
      {paidLine &&
        (perms.payView ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            title="ดู/บันทึกการชำระเงิน"
            className="text-sm tabular-nums underline-offset-2 hover:underline"
          >
            {paidLine}
          </button>
        ) : (
          <div className="text-sm tabular-nums">{paidLine}</div>
        ))}
      {perms.payView && (
        <PaymentModal
          open={open}
          onClose={() => setOpen(false)}
          hotelSlug={hotelSlug}
          bookingId={b.id}
          bookingCode={b.code}
          guestName={b.guest_name}
          bookingStatus={b.status}
          perms={{
            charge: perms.payCharge,
            verify: perms.payVerify,
            voidPay: perms.payVoid,
            refund: perms.payRefund,
          }}
        />
      )}
    </>
  );
}

/* ── เมนู action ต่อแถว (⋯) — รายการตามสถานะ · confirm dialog เฉพาะที่จำเป็น ── */
function RowActions({
  booking: b,
  hotelSlug,
  perms,
}: {
  booking: Row;
  hotelSlug: string;
  perms: BookingActionPerms;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkinOpen, setCheckinOpen] = useState(false);
  const toast = useToast();
  const { confirm, dialog } = useConfirm();

  async function run(action: (fd: FormData) => Promise<void>, okMsg: string) {
    setPending(true);
    setOpen(false);
    try {
      const fd = new FormData();
      fd.set("hotelSlug", hotelSlug);
      fd.set("bookingId", b.id);
      await action(fd);
      toast.ok(okMsg);
    } catch (e) {
      if (isNextControlFlowError(e)) throw e;
      toast.err(e instanceof Error ? e.message : "ทำรายการไม่สำเร็จ");
    } finally {
      setPending(false);
    }
  }

  type Item = { label: string; danger?: boolean; onClick: () => void };
  const items: Item[] = [];

  if (b.status === "pending" && perms.edit) {
    items.push({
      label: "ยืนยันการจอง",
      onClick: () => run(confirmBooking, `ยืนยัน ${b.code} แล้ว`),
    });
  }
  if (b.status === "confirmed" && perms.checkin) {
    items.push({
      // เช็คอิน = เปิด modal เลือกเบอร์ห้องก่อน
      label: "เช็คอิน",
      onClick: () => {
        setOpen(false);
        setCheckinOpen(true);
      },
    });
  }
  if (
    perms.payCharge &&
    ["pending", "confirmed", "checked_in"].includes(b.status) &&
    b.paid_satang < (b.charges_satang ?? b.total_satang)
  ) {
    items.push({
      label: "รับชำระเงิน",
      onClick: () => {
        setOpen(false);
        setPayOpen(true);
      },
    });
  }
  if (b.status === "checked_in" && perms.checkout) {
    items.push({
      // checkout modal: สรุปบิล + รับเงินยอดค้าง + เช็คเอาท์จบในจังหวะเดียว
      label: "เช็คเอาท์",
      onClick: () => {
        setOpen(false);
        setCheckoutOpen(true);
      },
    });
  }
  if ((b.status === "pending" || b.status === "confirmed") && perms.cancel) {
    items.push({
      label: "ยกเลิกการจอง",
      danger: true,
      onClick: async () => {
        // จำเป็นต้อง confirm — คืนห้องว่าง + คำนวณเงินคืนตามนโยบาย ย้อนไม่ได้
        const ok = await confirm({
          title: `ยกเลิกการจอง ${b.code}?`,
          description:
            "ห้องจะกลับไปว่างทันที · เงินที่ชำระแล้วจะคำนวณคืนตามนโยบายยกเลิกของแพ็กเกจราคา",
          tone: "danger",
          confirmLabel: "ยกเลิกการจอง",
        });
        if (ok) run(cancelBooking, `ยกเลิก ${b.code} แล้ว`);
      },
    });
  }

  if (items.length === 0) return null;

  return (
    <>
      {dialog}
      <PaymentModal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        hotelSlug={hotelSlug}
        bookingId={b.id}
        bookingCode={b.code}
        guestName={b.guest_name}
        bookingStatus={b.status}
        perms={{
          charge: perms.payCharge,
          verify: perms.payVerify,
          voidPay: perms.payVoid,
          refund: perms.payRefund,
        }}
      />
      <CheckoutModal
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        hotelSlug={hotelSlug}
        bookingId={b.id}
        code={b.code}
        guestName={b.guest_name}
        perms={{ charge: perms.payCharge, verify: perms.payVerify, refund: perms.payRefund }}
      />
      <CheckInModal
        open={checkinOpen}
        onClose={() => setCheckinOpen(false)}
        hotelSlug={hotelSlug}
        bookingId={b.id}
        code={b.code}
        guestName={b.guest_name}
      />
      {/* native button — Button shared ไม่ forward ref (Popover ต้องใช้ anchor) */}
      <button
        ref={ref}
        type="button"
        disabled={pending}
        onClick={() => setOpen((v) => !v)}
        aria-label="เมนูการจอง"
        className="btn btn-ghost btn-sm"
      >
        <MoreHorizontal size={17} />
      </button>
      <Popover
        open={open}
        onClose={() => setOpen(false)}
        anchor={ref.current}
        align="end"
        minWidth={180}
        ariaLabel="เมนูการจอง"
      >
        <div className="p-1">
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              onClick={it.onClick}
              className={`block w-full rounded-sm px-3 py-2 text-left text-base transition-colors hover:bg-bg-subtle ${
                it.danger ? "text-danger-strong" : "text-fg"
              }`}
            >
              {it.label}
            </button>
          ))}
        </div>
      </Popover>
    </>
  );
}
