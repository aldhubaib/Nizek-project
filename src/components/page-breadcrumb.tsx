import { Fragment, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type BreadcrumbItem = {
  label: ReactNode;
  onClick?: () => void;
  className?: string;
};

function Crumb({
  item,
  current,
}: {
  item: BreadcrumbItem;
  current: boolean;
}) {
  const className = cn(
    "page-name min-w-0 truncate",
    current ? "text-foreground" : "text-muted-foreground",
    item.className,
  );

  if (item.onClick && !current) {
    function onKeyDown(e: KeyboardEvent<HTMLSpanElement>) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        item.onClick?.();
      }
    }
    return (
      <span
        role="link"
        tabIndex={0}
        onClick={item.onClick}
        onKeyDown={onKeyDown}
        className={cn(className, "cursor-pointer hover:text-foreground")}
      >
        {item.label}
      </span>
    );
  }

  return (
    <span className={className} aria-current={current ? "page" : undefined}>
      {item.label}
    </span>
  );
}

export function PageBreadcrumb({ items }: { items: BreadcrumbItem[] }) {
  if (items.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5">
      {items.map((item, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <span className="page-name shrink-0 text-muted-foreground/40" aria-hidden>
              /
            </span>
          )}
          <Crumb item={item} current={i === items.length - 1} />
        </Fragment>
      ))}
    </nav>
  );
}
