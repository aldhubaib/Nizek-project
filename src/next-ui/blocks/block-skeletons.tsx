import { cn } from "@/next-ui/lib/cn"
import { Skeleton } from "@/next-ui/ui/skeleton"

/**
 * The loading shape of each block: an empty grey box in the block's own size (Social AI's
 * blocks brief, decision 13). `index` is accepted so a `Collection` can pass a position; the
 * shapes here do not vary by it.
 */

export function RecordCardSkeleton({ className }: { className?: string; index?: number }) {
  return <Skeleton className={cn("aspect-[4/5] w-full rounded-xl", className)} data-testid="record-card-skeleton" />
}

export function RecordRowSkeleton({ className }: { className?: string; index?: number }) {
  return <Skeleton className={cn("h-14 w-full rounded-lg", className)} data-testid="record-row-skeleton" />
}

export function StatTileSkeleton({ className }: { className?: string; index?: number }) {
  return <Skeleton className={cn("h-20 w-full rounded-xl", className)} data-testid="stat-tile-skeleton" />
}

export function HeaderCardSkeleton({ className }: { className?: string; index?: number }) {
  return <Skeleton className={cn("h-36 w-full rounded-xl", className)} data-testid="header-card-skeleton" />
}
