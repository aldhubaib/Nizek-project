"use client"

import * as React from "react"
import { Avatar as AvatarPrimitive } from "@base-ui/react/avatar"

import { cn } from "@/lib/utils"

type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

/*  4px-grid: 16 → 20 → 24 → 32 → 40 px.
 *  Steps: +4, +4, +8, +8. */
const AVATAR_SIZE: Record<AvatarSize, string> = {
  xs: "size-4",   // 16px
  sm: "size-5",   // 20px
  md: "size-6",   // 24px  (default)
  lg: "size-8",   // 32px
  xl: "size-10",  // 40px
};


function Avatar({
  className,
  size = "md",
  ...props
}: AvatarPrimitive.Root.Props & {
  size?: AvatarSize
}) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      data-size={size}
      className={cn(
        // No mix-blend on the ring: avatars appear in every chat and inbox row,
        // and a blend mode per row forces a backdrop read that drops paint
        // tiles while the list scrolls.
        "group/avatar relative flex shrink-0 rounded-full select-none after:absolute after:inset-0 after:rounded-full after:border after:border-foreground/10",
        AVATAR_SIZE[size],
        className
      )}
      {...props}
    />
  )
}

function AvatarImage({ className, ...props }: AvatarPrimitive.Image.Props) {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn(
        "aspect-square size-full rounded-full object-cover",
        className
      )}
      {...props}
    />
  )
}

function AvatarFallback({
  className,
  ...props
}: AvatarPrimitive.Fallback.Props) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(
        "flex size-full items-center justify-center rounded-full bg-muted text-muted-foreground",
        "group-data-[size=xs]/avatar:text-[8px]",
        "group-data-[size=sm]/avatar:text-[10px]",
        "group-data-[size=md]/avatar:text-xs",
        "group-data-[size=lg]/avatar:text-s",
        "group-data-[size=xl]/avatar:text-s",
        className
      )}
      {...props}
    />
  )
}

function AvatarBadge({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="avatar-badge"
      className={cn(
        "absolute right-0 bottom-0 z-10 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground bg-blend-color ring-2 ring-background select-none",
        "group-data-[size=xs]/avatar:size-1 group-data-[size=xs]/avatar:[&>svg]:hidden",
        "group-data-[size=sm]/avatar:size-1.5 group-data-[size=sm]/avatar:[&>svg]:hidden",
        "group-data-[size=md]/avatar:size-2 group-data-[size=md]/avatar:[&>svg]:hidden",
        "group-data-[size=lg]/avatar:size-2.5 group-data-[size=lg]/avatar:[&>svg]:size-2",
        "group-data-[size=xl]/avatar:size-3 group-data-[size=xl]/avatar:[&>svg]:size-2",
        className
      )}
      {...props}
    />
  )
}

function AvatarGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="avatar-group"
      className={cn(
        "group/avatar-group flex -space-x-2 *:data-[slot=avatar]:ring-2 *:data-[slot=avatar]:ring-background",
        className
      )}
      {...props}
    />
  )
}

function AvatarGroupCount({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="avatar-group-count"
      className={cn(
        "relative flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground ring-2 ring-background",
        "group-has-data-[size=xs]/avatar-group:size-4",
        "group-has-data-[size=sm]/avatar-group:size-5",
        "group-has-data-[size=lg]/avatar-group:size-8",
        "group-has-data-[size=xl]/avatar-group:size-10",
        "[&>svg]:size-3",
        "group-has-data-[size=xs]/avatar-group:[&>svg]:size-2",
        "group-has-data-[size=sm]/avatar-group:[&>svg]:size-2.5",
        "group-has-data-[size=lg]/avatar-group:[&>svg]:size-4",
        "group-has-data-[size=xl]/avatar-group:[&>svg]:size-5",
        className
      )}
      {...props}
    />
  )
}

export {
  Avatar,
  AvatarImage,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarBadge,
}
export type { AvatarSize }
