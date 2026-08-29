import { Fragment, type KeyboardEvent, type ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export type BreadcrumbItem = {
  label: ReactNode;
  href?: string;
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

  if (current) {
    return (
      <span className={className} aria-current="page">
        {item.label}
      </span>
    );
  }

  if (item.href) {
    return (
      <Link href={item.href} className={cn(className, "hover:text-foreground")}>
        {item.label}
      </Link>
    );
  }

  if (item.onClick) {
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

  return <span className={className}>{item.label}</span>;
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
