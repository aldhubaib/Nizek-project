import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  NIZEK_BOT_AUTHOR_ID,
  NIZEK_BOT_INITIALS,
  NIZEK_BOT_NAME,
} from "@/lib/deadline-reminder-payload";

export type ActivityCardTheme = {
  accent: string;
  border: string;
  ring: string;
  iconWrap: string;
  button: string;
  pill?: string;
  quote?: string;
};

export function ActivityCard({
  theme,
  icon: Icon,
  category,
  title,
  status,
  children,
  href,
  onAction,
  actionLabel,
  actionIcon: ActionIcon,
  footer,
  createdAt,
}: {
  theme: ActivityCardTheme;
  icon: LucideIcon;
  category: string;
  title: string;
  status?: string;
  children?: React.ReactNode;
  href?: string;
  onAction?: () => void;
  actionLabel: string;
  actionIcon?: LucideIcon;
  footer?: React.ReactNode;
  createdAt: string;
}) {
  const Leading = ActionIcon ?? Icon;
  const actionClass = cn(
    "flex w-full items-center gap-2 rounded-lg border px-3 py-2.5 text-start text-s font-medium transition-colors",
    theme.button,
  );
  const actionInner = (
    <>
      <Leading className="size-4 shrink-0" strokeWidth={2} />
      <span className="min-w-0 flex-1 truncate text-foreground">{actionLabel}</span>
      {href ? <ArrowUpRight className={cn("size-3.5 shrink-0", theme.accent)} /> : null}
    </>
  );
  return (
    <div
      className={cn(
        "w-full overflow-hidden rounded-xl border bg-card/95 shadow-sm ring-1 ring-inset",
        theme.border,
        theme.ring,
      )}
    >
      <div className={cn("h-0.5 w-full bg-current opacity-60", theme.accent)} />

      <div className="space-y-3 p-3.5">
        <div className="flex items-start gap-s">
          <div
            className={cn(
              "grid size-9 shrink-0 place-items-center rounded-full",
              theme.iconWrap,
            )}
          >
            <Icon className="size-4" strokeWidth={2} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {category}
            </p>
            <h3 className="mt-0.5 text-s font-semibold leading-snug text-foreground">
              {title}
            </h3>
          </div>
          {status && theme.pill && (
            <span
              className={cn(
                "shrink-0 rounded-lg border px-2 py-0.5 text-xs font-semibold",
                theme.pill,
              )}
            >
              {status}
            </span>
          )}
        </div>

        {children}

        {onAction ? (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onAction();
            }}
            className={actionClass}
          >
            {actionInner}
          </button>
        ) : href ? (
          <Link href={href} className={actionClass}>
            {actionInner}
          </Link>
        ) : null}

        {footer}

        <div className="flex justify-end">
          <span className="text-xs text-muted-foreground">{formatTime(createdAt)}</span>
        </div>
      </div>
    </div>
  );
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function NizekBotAvatar({ show }: { show: boolean }) {
  if (!show) return <div className="size-8 shrink-0" aria-hidden />;
  return (
    <div className="shrink-0 self-start">
      <Avatar>
        <AvatarFallback className="bg-success font-bold text-white shadow-sm">
          {NIZEK_BOT_INITIALS}
        </AvatarFallback>
      </Avatar>
    </div>
  );
}

function initials(name: string) {
  return (
    name
      .split(" ")
      .map((s) => s[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

export function isNizekBotAuthor(authorId?: string | null) {
  return !authorId || authorId === NIZEK_BOT_AUTHOR_ID;
}

export function chatPostAuthorLabel(authorId?: string | null, authorName?: string | null) {
  if (isNizekBotAuthor(authorId)) return NIZEK_BOT_NAME;
  return authorName?.trim() || NIZEK_BOT_NAME;
}

export function ChatPostAvatar({
  show,
  authorId,
  authorName,
  authorImageUrl,
}: {
  show: boolean;
  authorId?: string | null;
  authorName?: string | null;
  authorImageUrl?: string | null;
}) {
  if (isNizekBotAuthor(authorId) || !authorName?.trim()) {
    return <NizekBotAvatar show={show} />;
  }
  if (!show) return <div className="size-8 shrink-0" aria-hidden />;
  const name = authorName.trim();
  return (
    <div className="shrink-0 self-start">
      <Avatar>
        {authorImageUrl && <AvatarImage src={authorImageUrl} alt="" />}
        <AvatarFallback className="bg-primary/20 font-semibold text-primary">
          {initials(name)}
        </AvatarFallback>
      </Avatar>
    </div>
  );
}
