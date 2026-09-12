"use client";

import { UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

export interface BoardPerson {
  name: string | null;
  imageUrl: string | null;
}

const SIZE = {
  xs: "size-5 text-[10px]",
  sm: "size-6 text-[11px]",
} as const;

export function initialsOf(name: string | null): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/**
 * A person on the board, wherever one is shown: on a card, in the filter, and
 * in the assignee picker.
 *
 * `person` being null is "nobody", drawn as an outlined silhouette rather than
 * a blank, so an unassigned card reads as deliberately unassigned rather than
 * as something still loading.
 */
export function MemberAvatar({
  person,
  size = "xs",
  className,
}: {
  person: BoardPerson | null;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  if (!person) {
    return (
      <span
        aria-hidden
        className={cn(
          // The outline the sprint document's EmptyAssigneeIcon uses, so an
          // unassigned row looks the same in both places.
          "grid shrink-0 place-items-center rounded-full border border-muted-foreground/70 text-muted-foreground",
          SIZE[size],
          className,
        )}
      >
        <UserRound className="size-3" />
      </span>
    );
  }

  if (person.imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={person.imageUrl}
        alt=""
        className={cn("shrink-0 rounded-full object-cover", SIZE[size], className)}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-muted font-medium text-muted-foreground",
        SIZE[size],
        className,
      )}
    >
      {initialsOf(person.name)}
    </span>
  );
}
