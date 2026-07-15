"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  DataTable,
  SearchBox,
  Badge,
  EmptyState,
  type DataTableColumn,
} from "@/components/ui";

export interface HotelRow {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  is_active: boolean;
  multi_property: boolean;
  packageName: string | null;
  memberCount: number;
}

export function HotelsTable({ hotels }: { hotels: HotelRow[] }) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return hotels;
    return hotels.filter(
      (h) =>
        h.name.toLowerCase().includes(term) ||
        h.slug.toLowerCase().includes(term),
    );
  }, [hotels, q]);

  const columns: DataTableColumn<HotelRow>[] = [
    {
      key: "name",
      header: "ชื่อ",
      sortable: true,
      render: (h) => (
        <div className="flex items-center gap-2">
          <Link
            href={`/super-admin/hotels/${h.id}`}
            className="font-medium text-fg hover:underline"
          >
            {h.name}
          </Link>
          {!h.is_active && <Badge tone="danger">ปิดใช้งาน</Badge>}
          {h.multi_property && <Badge tone="neutral">หลายสาขา</Badge>}
        </div>
      ),
    },
    {
      key: "slug",
      header: "URL",
      sortable: true,
      render: (h) => <span className="text-sm text-fg-muted">/{h.slug}</span>,
    },
    {
      key: "packageName",
      header: "แพ็กเกจ",
      sortable: true,
      render: (h) =>
        h.packageName ? (
          <Badge tone="brand">{h.packageName}</Badge>
        ) : (
          <span className="text-sm text-fg-subtle">—</span>
        ),
    },
    {
      key: "memberCount",
      header: "สมาชิก",
      sortable: true,
      align: "right",
    },
    {
      key: "created_at",
      header: "สร้างเมื่อ",
      sortable: true,
      align: "right",
      render: (h) => (
        <span className="text-sm text-fg-muted">
          {new Date(h.created_at).toLocaleDateString("th-TH")}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <SearchBox
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="ค้นหาชื่อโรงแรม หรือ URL"
        className="max-w-sm"
      />
      <DataTable<HotelRow>
        columns={columns}
        data={filtered}
        keyField="id"
        pagination={{ pageSize: 20 }}
        emptyState={
          <EmptyState
            title="ไม่พบโรงแรม"
            description={
              q.trim() ? "ลองเปลี่ยนคำค้นหา" : "ยังไม่มีโรงแรมในระบบ"
            }
          />
        }
      />
    </div>
  );
}
