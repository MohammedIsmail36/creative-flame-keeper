import * as React from "react";
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  RowSelectionState,
  OnChangeFn,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Settings2,
  Search,
  SlidersHorizontal,
  X,
  Loader2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";

// ── Types ──────────────────────────────────────────────────
interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  /** Global search filter value (controlled externally) */
  globalFilter?: string;
  onGlobalFilterChange?: (value: string) => void;
  /** Custom global filter function */
  globalFilterFn?: import("@tanstack/react-table").FilterFn<TData>;
  /** Column-level filters (controlled externally) */
  columnFilters?: ColumnFiltersState;
  onColumnFiltersChange?: OnChangeFn<ColumnFiltersState>;
  /** Row selection (controlled externally) */
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: OnChangeFn<RowSelectionState>;
  /** Column visibility (controlled externally) */
  columnVisibility?: VisibilityState;
  onColumnVisibilityChange?: (updater: VisibilityState | ((prev: VisibilityState) => VisibilityState)) => void;
  /** Map column id → Arabic label for the column toggle menu */
  columnLabels?: Record<string, string>;
  /** Custom row id accessor */
  getRowId?: (row: TData) => string;
  /** Search placeholder */
  searchPlaceholder?: string;
  /** Show built-in search input */
  showSearch?: boolean;
  /** Show column visibility toggle */
  showColumnToggle?: boolean;
  /** Show pagination */
  showPagination?: boolean;
  /** Initial page size */
  pageSize?: number;
  /** Loading state */
  isLoading?: boolean;
  /** Empty state message */
  emptyMessage?: string;
  /** Row click handler */
  onRowClick?: (row: TData) => void;
  /** Extra toolbar content (buttons, filters, etc.) rendered after search */
  toolbarContent?: React.ReactNode;
  /** Extra toolbar content rendered before search (left side in RTL) */
  toolbarStart?: React.ReactNode;
}

// ── Main DataTable ─────────────────────────────────────────
export function DataTable<TData, TValue>({
  columns,
  data,
  globalFilter: externalGlobalFilter,
  onGlobalFilterChange,
  columnFilters: externalColumnFilters,
  onColumnFiltersChange,
  rowSelection: externalRowSelection,
  onRowSelectionChange,
  columnVisibility: externalColumnVisibility,
  onColumnVisibilityChange,
  columnLabels = {},
  getRowId,
  searchPlaceholder = "بحث...",
  showSearch = true,
  showColumnToggle = true,
  showPagination = true,
  pageSize = 15,
  isLoading = false,
  emptyMessage = "لا توجد بيانات",
  onRowClick,
  toolbarContent,
  toolbarStart,
  globalFilterFn: customGlobalFilterFn,
}: DataTableProps<TData, TValue>) {
  // Internal state (used when not controlled externally)
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [internalGlobalFilter, setInternalGlobalFilter] = React.useState("");
  const [internalColumnFilters, setInternalColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [internalColumnVisibility, setInternalColumnVisibility] = React.useState<VisibilityState>({});
  const [internalRowSelection, setInternalRowSelection] = React.useState<RowSelectionState>({});

  // Resolve controlled vs uncontrolled
  const globalFilterValue = externalGlobalFilter ?? internalGlobalFilter;
  const setGlobalFilter = onGlobalFilterChange ?? setInternalGlobalFilter;
  const columnFiltersValue = externalColumnFilters ?? internalColumnFilters;
  const columnVisibilityValue = externalColumnVisibility ?? internalColumnVisibility;
  const rowSelectionValue = externalRowSelection ?? internalRowSelection;

  const handleRowSelectionChange: OnChangeFn<RowSelectionState> = React.useCallback(
    (updater) => {
      if (onRowSelectionChange) {
        onRowSelectionChange(updater);
      } else {
        setInternalRowSelection(updater);
      }
    },
    [onRowSelectionChange]
  );

  const handleColumnVisibilityChange = React.useCallback(
    (updater: VisibilityState | ((old: VisibilityState) => VisibilityState)) => {
      if (onColumnVisibilityChange) {
        onColumnVisibilityChange(updater);
      } else {
        setInternalColumnVisibility(
          typeof updater === "function" ? updater(internalColumnVisibility) : updater
        );
      }
    },
    [onColumnVisibilityChange, internalColumnVisibility]
  );

  const handleColumnFiltersChange: OnChangeFn<ColumnFiltersState> = React.useCallback(
    (updater) => {
      if (onColumnFiltersChange) {
        onColumnFiltersChange(updater);
      } else {
        setInternalColumnFilters(updater);
      }
    },
    [onColumnFiltersChange]
  );

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: showPagination ? getPaginationRowModel() : undefined,
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onColumnVisibilityChange: handleColumnVisibilityChange as any,
    onColumnFiltersChange: handleColumnFiltersChange,
    onRowSelectionChange: handleRowSelectionChange,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: customGlobalFilterFn ?? "includesString",
    getRowId,
    state: {
      sorting,
      columnVisibility: columnVisibilityValue,
      columnFilters: columnFiltersValue,
      rowSelection: rowSelectionValue,
      globalFilter: globalFilterValue,
    },
    initialState: {
      pagination: { pageSize },
    },
  });

  const activeFiltersCount = columnFiltersValue.length + (globalFilterValue ? 1 : 0);

  return (
    <div className="space-y-3">
      {/* ── Toolbar ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        {toolbarStart}
        
        {showSearch && (
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder={searchPlaceholder}
              value={globalFilterValue}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="pr-9 h-9 text-sm"
            />
            {globalFilterValue && (
              <button
                onClick={() => setGlobalFilter("")}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}

        {toolbarContent}

        {/* Active filters badge */}
        {activeFiltersCount > 0 && (
          <Badge variant="secondary" className="gap-1.5 h-8 px-3">
            <SlidersHorizontal className="h-3 w-3" />
            {activeFiltersCount} فلتر نشط
          </Badge>
        )}

        {showColumnToggle && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="mr-auto gap-2 h-9">
                <Settings2 className="h-4 w-4" />
                الأعمدة
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                إظهار / إخفاء الأعمدة
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {table
                .getAllColumns()
                .filter((col) => col.getCanHide())
                .map((col) => {
                  const label =
                    columnLabels[col.id] ||
                    (typeof col.columnDef.header === "string"
                      ? col.columnDef.header
                      : col.id);
                  return (
                    <DropdownMenuCheckboxItem
                      key={col.id}
                      checked={col.getIsVisible()}
                      onCheckedChange={(value) => col.toggleVisibility(!!value)}
                    >
                      {label}
                    </DropdownMenuCheckboxItem>
                  );
                })}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* ── Table ── */}
      <div className="rounded-lg border bg-card overflow-hidden shadow-sm">
        <div className="relative w-full overflow-auto">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="bg-muted/40 hover:bg-muted/40 border-b">
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      className="text-right font-semibold text-xs text-muted-foreground h-11 px-4 whitespace-nowrap"
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>

            <TableBody>
              {isLoading ? (
                // Loading skeleton rows
                Array.from({ length: Math.min(pageSize, 5) }).map((_, i) => (
                  <TableRow key={`skeleton-${i}`} className="hover:bg-transparent">
                    {columns.map((_, j) => (
                      <TableCell key={j} className="px-4 py-3">
                        <Skeleton className="h-5 w-full max-w-[180px]" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && "selected"}
                    className={
                      onRowClick
                        ? "cursor-pointer hover:bg-muted/50 transition-colors"
                        : "hover:bg-muted/30 transition-colors"
                    }
                    onClick={() => onRowClick?.(row.original)}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="px-4 py-3">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-32 text-center text-muted-foreground"
                  >
                    <div className="flex flex-col items-center gap-2">
                      <Search className="h-8 w-8 text-muted-foreground/40" />
                      <p>{emptyMessage}</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>

            {/* Footer */}
            {table.getFooterGroups().some((fg) =>
              fg.headers.some((h) => h.column.columnDef.footer)
            ) && (
              <TableFooter>
                {table.getFooterGroups().map((footerGroup) => (
                  <TableRow key={footerGroup.id}>
                    {footerGroup.headers.map((header) => (
                      <TableCell key={header.id} className="px-4 py-2 font-semibold">
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.footer, header.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableFooter>
            )}
          </Table>
        </div>
      </div>

      {/* ── Pagination ── */}
      {showPagination && (
        <div className="flex items-center justify-between gap-4 flex-wrap pt-1">
          {/* Info */}
          <div className="flex items-center gap-3">
            {/* Selected count */}
            {Object.keys(rowSelectionValue).length > 0 && (
              <span className="text-sm text-primary font-medium">
                {Object.keys(rowSelectionValue).length} محدد
              </span>
            )}
            <span className="text-sm text-muted-foreground">
              {table.getFilteredRowModel().rows.length > 0 ? (
                <>
                  {table.getFilteredRowModel().rows.length} من أصل {data.length} عنصر
                </>
              ) : (
                <>{data.length} عنصر</>
              )}
            </span>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-3">
            {/* Page size selector */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground whitespace-nowrap">صفوف لكل صفحة</span>
              <Select
                value={`${table.getState().pagination.pageSize}`}
                onValueChange={(value) => table.setPageSize(Number(value))}
              >
                <SelectTrigger className="h-8 w-[70px] text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[10, 15, 20, 30, 50, 100].map((size) => (
                    <SelectItem key={size} value={`${size}`}>
                      {size}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Page indicator */}
            <span className="text-sm text-muted-foreground whitespace-nowrap min-w-[80px] text-center">
              صفحة {table.getState().pagination.pageIndex + 1} من {table.getPageCount() || 1}
            </span>

            {/* Navigation buttons */}
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => table.setPageIndex(0)}
                disabled={!table.getCanPreviousPage()}
                title="أول صفحة"
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                title="الصفحة السابقة"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                title="الصفحة التالية"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                disabled={!table.getCanNextPage()}
                title="آخر صفحة"
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sortable Column Header Helper ──────────────────────────
export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
}: {
  column: import("@tanstack/react-table").Column<TData, TValue>;
  title: string;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="-mr-3 h-8 gap-1.5 text-xs font-semibold hover:bg-muted/60"
      onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
    >
      {title}
      <ArrowUpDown className="h-3 w-3 opacity-50" />
    </Button>
  );
}

// ── Selection Column Helper ────────────────────────────────
export function getSelectionColumn<TData>(): ColumnDef<TData, any> {
  return {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected()
            ? true
            : table.getIsSomePageRowsSelected()
              ? "indeterminate"
              : false
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="تحديد الكل"
        className="translate-y-[2px]"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="تحديد الصف"
        className="translate-y-[2px]"
        onClick={(e) => e.stopPropagation()}
      />
    ),
    enableSorting: false,
    enableHiding: false,
  };
}
