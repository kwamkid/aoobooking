"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Pagination } from "./pagination";

/* PaginationNav — Pagination สำหรับหน้า server-render (rules #20)
 * แปลง onPageChange → อัปเดต ?page= ใน URL (คง param อื่นไว้ครบ)
 * ใช้คู่กับ RPC pagination: page → offset ฝั่ง server */
export function PaginationNav({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
}: {
  currentPage: number;
  totalPages: number;
  totalItems?: number;
  pageSize?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (totalPages <= 1) return null;

  const go = (page: number) => {
    const p = new URLSearchParams(searchParams);
    p.set("page", String(page));
    router.push(`${pathname}?${p.toString()}`);
  };

  return (
    <Pagination
      currentPage={currentPage}
      totalPages={totalPages}
      totalItems={totalItems}
      pageSize={pageSize}
      onPageChange={go}
    />
  );
}
