import { cn } from "@/next-ui/lib/cn"

function Skeleton({ className, ...props }: React.ComponentProps<"div"> & { index?: number }) {
  const domProps = { ...props }
  delete domProps.index
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...domProps}
    />
  )
}

export { Skeleton }
