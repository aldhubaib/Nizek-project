"use client";

import type { ReactNode, MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

export function formatSettingsDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function SettingsLastModified({ at }: { at: string }) {
  return (
    <div className="flex items-center gap-2.5 text-s text-muted-foreground">
      <span className="size-7 shrink-0 rounded-full bg-muted" aria-hidden />
      {formatSettingsDate(at)}
    </div>
  );
}

export function SettingsRowAction({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={className}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {children}
    </div>
  );
}

export function SettingsTableRow({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  const router = useRouter();

  function go(event: MouseEvent<HTMLTableRowElement>) {
    if (event.defaultPrevented) return;
    const target = event.target as HTMLElement;
    if (target.closest("a, button, input, select, [role='switch']")) return;
    router.push(href);
  }

  return (
    <tr
      role="link"
      tabIndex={0}
      className="cursor-pointer border-t border-border/50 hover:bg-muted/40"
      onClick={go}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        router.push(href);
      }}
    >
      {children}
    </tr>
  );
}

export function SettingsDataTable({
  columns,
  rows,
  empty = "Nothing here yet.",
}: {
  columns: { label: string; className?: string }[];
  rows: ReactNode[];
  empty?: string;
}) {
  return (
    <div className="overflow-x-auto overflow-hidden rounded-xl border border-border bg-card">
      <table className="w-full min-w-[40rem] table-fixed text-start">
        <thead>
          <tr className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {columns.map((col, index) => (
              <th
                key={`${col.label}-${index}`}
                className={cn(
                  "px-4 py-2.5 text-start align-middle font-medium whitespace-nowrap",
                  col.className,
                )}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="border-t border-border/50 px-4 py-8 text-start text-s text-muted-foreground"
              >
                {empty}
              </td>
            </tr>
          ) : (
            rows
          )}
        </tbody>
      </table>
    </div>
  );
}
