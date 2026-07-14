"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { Pagination } from "./pagination";

/* ==========================================================================
 *  DataTable — generic table + sort ในตัว + client-side pagination (optional)
 *
 *  - sort: คลิกหัวคอลัมน์ cycle asc → desc → clear · string เทียบ localeCompare("th")
 *    · number เทียบตามค่า · null/undefined ไปท้ายเสมอ
 *  - sort อ่านค่าดิบจาก row[key] — render ใช้แค่แสดงผล
 *  - pagination: slice ในตัว + render <Pagination /> ใต้ตาราง
 * ========================================================================== */

export interface DataTableColumn<T> {
  /** key ของ field ใน row — ใช้เป็น React key + ค่าที่ใช้ sort/แสดงผล default */
  key: string;
  header: ReactNode;
  /** custom cell — ถ้าไม่ส่ง จะแสดง String(row[key]) */
  render?: (row: T) => ReactNode;
  sortable?: boolean;
  align?: "left" | "right";
  /** ความกว้างคอลัมน์ เช่น 120 หรือ "20%" */
  width?: string | number;
}

export interface DataTablePagination {
  /** ขนาดหน้าเริ่มต้น (default 10) */
  pageSize?: number;
  pageSizeOptions?: number[];
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  /** field ใน row ที่ unique — ใช้เป็น React key ของแถว */
  keyField: keyof T;
  /** เปิด client-side pagination: true = default, หรือ object ปรับ pageSize */
  pagination?: boolean | DataTablePagination;
  /** แสดงเมื่อ data ว่าง */
  emptyState?: ReactNode;
  className?: string;
}

type SortDirection = "asc" | "desc";
interface SortState {
  key: string | null;
  direction: SortDirection;
}

function cx(...parts: (string | false | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

function getRaw<T>(row: T, key: string): unknown {
  return (row as Record<string, unknown>)[key];
}

/** เทียบค่า 2 ตัวสำหรับ sort — null ไปท้ายเสมอ (ไม่ขึ้นกับทิศทาง) */
function compareValues(a: unknown, b: unknown, dir: 1 | -1): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return (a - b) * dir;
  return String(a).localeCompare(String(b), "th") * dir;
}

export function DataTable<T>({
  columns,
  data,
  keyField,
  pagination,
  emptyState,
  className,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<SortState>({ key: null, direction: "asc" });

  const paginationOpts: DataTablePagination | null = pagination
    ? pagination === true
      ? {}
      : pagination
    : null;
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(paginationOpts?.pageSize ?? 10);

  // คลิกหัวคอลัมน์: asc → desc → clear (กลับลำดับเดิม)
  const toggleSort = (key: string) => {
    setSort((prev) => {
      if (prev.key !== key) return { key, direction: "asc" };
      if (prev.direction === "asc") return { key, direction: "desc" };
      return { key: null, direction: "asc" };
    });
  };

  const sorted = useMemo(() => {
    if (!sort.key) return data;
    const key = sort.key;
    const dir = sort.direction === "asc" ? 1 : -1;
    return [...data].sort((a, b) =>
      compareValues(getRaw(a, key), getRaw(b, key), dir),
    );
  }, [data, sort]);

  // pagination: clamp หน้าปัจจุบันเมื่อ data หด (ไม่ให้ค้างบนหน้าว่าง)
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const rows = paginationOpts
    ? sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize)
    : sorted;

  return (
    <div className={className}>
      <div className="-mx-1 overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              {columns.map((col) => {
                const active = sort.key === col.key;
                return (
                  <th
                    key={col.key}
                    className={cx(
                      col.align === "right" && "text-right",
                      col.sortable && "p-0",
                    )}
                    style={col.width != null ? { width: col.width } : undefined}
                    aria-sort={
                      active
                        ? sort.direction === "asc"
                          ? "ascending"
                          : "descending"
                        : undefined
                    }
                  >
                    {col.sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(col.key)}
                        className={cx(
                          "flex w-full select-none items-center gap-1 px-2 py-2 transition-colors hover:text-fg",
                          active ? "font-semibold text-fg" : "text-fg-muted",
                          col.align === "right" && "justify-end",
                        )}
                      >
                        <span className="truncate">{col.header}</span>
                        {active ? (
                          sort.direction === "asc" ? (
                            <ChevronUp className="h-3.5 w-3.5 shrink-0" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                          )
                        ) : (
                          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-fg-subtle" />
                        )}
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length}>
                  <div className="py-8 text-center text-sm text-fg-subtle">
                    {emptyState ?? "ไม่มีข้อมูล"}
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={String(row[keyField])}>
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cx(col.align === "right" && "text-right")}
                    >
                      {col.render
                        ? col.render(row)
                        : ((getRaw(row, col.key) as ReactNode) ?? null)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {paginationOpts && sorted.length > 0 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setPage}
          totalItems={sorted.length}
          pageSize={pageSize}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          pageSizeOptions={paginationOpts.pageSizeOptions}
        />
      )}
    </div>
  );
}
