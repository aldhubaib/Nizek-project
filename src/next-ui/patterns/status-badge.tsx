import { cn } from "@/next-ui/lib/cn"

import { Badge } from "@/next-ui/ui/badge"

export type Status = "neutral" | "success" | "warning" | "info" | "destructive"

const TONE: Record<Status, string> = {
  neutral: "bg-muted text-muted-foreground [&>i]:bg-muted-foreground",
  success: "bg-success/15 text-success [&>i]:bg-success",
  warning: "bg-warning/15 text-warning [&>i]:bg-warning",
  info: "bg-info/15 text-info [&>i]:bg-info",
  destructive: "bg-destructive/15 text-destructive [&>i]:bg-destructive",
}

/** Nizek's record states, by the word a screen passes; anything unknown is neutral. */
export const STATUS_OF: Record<string, Status> = {
  active: "success",
  upcoming: "info",
  expired: "neutral",
  archived: "neutral",
  late: "warning",
  blocked: "destructive",
  pending: "warning",
  done: "success",
}

/** Status token + leading dot (Social AI's ui-system). The only place status colors appear. */
export function StatusBadge({
  status,
  label,
  className,
}: {
  status: Status | string
  label?: string
  className?: string
}) {
  const tone: Status = (TONE as Record<string, string>)[status] ? (status as Status) : (STATUS_OF[status] ?? "neutral")
  return (
    <Badge variant="secondary" className={cn("gap-1.5 border-0 font-medium capitalize", TONE[tone], className)}>
      <i aria-hidden className="size-1.5 rounded-full" />
      {label ?? status}
    </Badge>
  )
}
