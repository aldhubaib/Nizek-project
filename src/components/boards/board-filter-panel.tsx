"use client";

import { CircleCheck, CircleDashed, Clock, Search, Tag, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { boardColor } from "@/lib/board-palette";
import { BoardIcon } from "./board-icon";
import { LabelChip } from "./card-labels";
import { MemberAvatar } from "./member-avatar";
import {
  ACTIVITY_WINDOWS,
  DUE_FILTERS,
  EMPTY_FILTER,
  UNASSIGNED,
  UNLABELLED,
  activeFilterCount,
  toggleChoice,
  type ActivityWindow,
  type BoardFilter,
  type DueFilter,
} from "@/lib/board-filter";
import type { BoardCardTypeDTO, BoardLabelDTO } from "@/actions/board";

interface Props {
  filter: BoardFilter;
  onChange: (next: BoardFilter) => void;
  cardTypes: BoardCardTypeDTO[];
  labels: BoardLabelDTO[];
  members: { id: string; name: string | null; imageUrl: string | null }[];
  viewerId: string;
  /** How many cards survive the filter, so the effect is visible while setting it. */
  matchCount: number;
  totalCount: number;
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <h4 className="text-xs font-semibold text-muted-foreground">{title}</h4>
      {children}
    </div>
  );
}

/** A checkbox row: the whole row is the hit target, not just the box. */
function Choice({
  checked,
  onToggle,
  children,
}: {
  checked: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 transition-colors hover:bg-accent/50">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="size-3.5 shrink-0 accent-primary"
      />
      <span className="flex min-w-0 flex-1 items-center gap-2 text-s">
        {children}
      </span>
    </label>
  );
}

export function BoardFilterPanel({
  filter,
  onChange,
  cardTypes,
  labels,
  members,
  viewerId,
  matchCount,
  totalCount,
}: Props) {
  const count = activeFilterCount(filter);
  const viewer = members.find((member) => member.id === viewerId);
  // Everyone else, so "assigned to me" is not offered twice.
  const others = members.filter((member) => member.id !== viewerId);

  function set<K extends keyof BoardFilter>(key: K, value: BoardFilter[K]) {
    onChange({ ...filter, [key]: value });
  }

  return (
    <div className="flex max-h-[70dvh] flex-col gap-3 overflow-y-auto">
      <div className="flex items-center justify-between gap-2">
        <p className="text-s font-medium">Filter</p>
        {count > 0 && (
          <button
            type="button"
            onClick={() => onChange({ ...EMPTY_FILTER, collapseEmpty: filter.collapseEmpty })}
            className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="size-3" />
            Clear
          </button>
        )}
      </div>

      <div className="space-y-1">
        <div className="relative">
          <Search className="pointer-events-none absolute inset-y-0 start-2 my-auto size-3.5 text-muted-foreground/60" />
          <input
            value={filter.keyword}
            onChange={(event) => set("keyword", event.target.value)}
            placeholder="Enter a keyword…"
            className="h-8 w-full rounded-md border border-border bg-field ps-7 pe-2 text-s outline-none placeholder:text-muted-foreground/60 focus:border-primary/50"
          />
        </div>
        <p className="text-xs text-muted-foreground/70">
          Searches titles, descriptions, card numbers and assignees.
        </p>
      </div>

      <Section title="Assignee">
        <Choice
          checked={filter.assignees.includes(UNASSIGNED)}
          onToggle={() => set("assignees", toggleChoice(filter.assignees, UNASSIGNED))}
        >
          <MemberAvatar person={null} />
          Unassigned
        </Choice>
        {viewer && (
          <Choice
            checked={filter.assignees.includes(viewer.id)}
            onToggle={() => set("assignees", toggleChoice(filter.assignees, viewer.id))}
          >
            <MemberAvatar person={viewer} />
            Assigned to me
          </Choice>
        )}
        {others.map((member) => (
          <Choice
            key={member.id}
            checked={filter.assignees.includes(member.id)}
            onToggle={() => set("assignees", toggleChoice(filter.assignees, member.id))}
          >
            <MemberAvatar person={member} />
            <span className="truncate">{member.name ?? "Unnamed"}</span>
          </Choice>
        ))}
      </Section>

      <Section title="Card type">
        {cardTypes.map((type) => {
          const palette = boardColor(type.color);
          return (
            <Choice
              key={type.id}
              checked={filter.cardTypes.includes(type.id)}
              onToggle={() => set("cardTypes", toggleChoice(filter.cardTypes, type.id))}
            >
              <BoardIcon name={type.icon} className={cn("size-3.5 shrink-0", palette.text)} />
              <span className="truncate">{type.name}</span>
            </Choice>
          );
        })}
      </Section>

      {labels.length > 0 && (
        <Section title="Labels">
          <Choice
            checked={filter.labels.includes(UNLABELLED)}
            onToggle={() => set("labels", toggleChoice(filter.labels, UNLABELLED))}
          >
            <Tag className="size-3.5 shrink-0 text-muted-foreground/60" />
            No labels
          </Choice>
          {labels.map((label) => (
            <Choice
              key={label.id}
              checked={filter.labels.includes(label.id)}
              onToggle={() => set("labels", toggleChoice(filter.labels, label.id))}
            >
              <LabelChip label={label} className="min-w-0 flex-1" />
            </Choice>
          ))}
        </Section>
      )}

      <Section title="Card status">
        <Choice
          checked={filter.statuses.includes("complete")}
          onToggle={() => set("statuses", toggleChoice(filter.statuses, "complete"))}
        >
          <CircleCheck className="size-3.5 shrink-0 text-success" />
          Every required field answered
        </Choice>
        <Choice
          checked={filter.statuses.includes("incomplete")}
          onToggle={() => set("statuses", toggleChoice(filter.statuses, "incomplete"))}
        >
          <CircleDashed className="size-3.5 shrink-0 text-orange" />
          Still missing an answer
        </Choice>
      </Section>

      <Section title="Due date">
        {DUE_FILTERS.map((choice) => (
          <Choice
            key={choice.id}
            checked={filter.due.includes(choice.id)}
            onToggle={() => set("due", toggleChoice<DueFilter>(filter.due, choice.id))}
          >
            <Clock
              className={cn(
                "size-3.5 shrink-0",
                choice.id === "overdue" && "text-destructive",
                choice.id === "day" && "text-orange",
                choice.id === "done" && "text-success",
                (choice.id === "none" || choice.id === "week" || choice.id === "month") &&
                  "text-muted-foreground/60",
              )}
            />
            {choice.label}
          </Choice>
        ))}
      </Section>

      <Section title="Activity">
        {ACTIVITY_WINDOWS.map((window) => (
          <Choice
            key={window.id}
            checked={filter.activity.includes(window.id)}
            onToggle={() =>
              set("activity", toggleChoice<ActivityWindow>(filter.activity, window.id))
            }
          >
            {window.label}
          </Choice>
        ))}
      </Section>

      <div className="space-y-2 border-t border-border/60 pt-2.5">
        <label className="flex cursor-pointer items-center justify-between gap-2">
          <span className="text-s">Hide columns with no matches</span>
          <input
            type="checkbox"
            checked={filter.collapseEmpty}
            onChange={() => set("collapseEmpty", !filter.collapseEmpty)}
            className="size-3.5 shrink-0 accent-primary"
          />
        </label>

        <label className="flex items-center justify-between gap-2">
          <span className="text-s">Match</span>
          <select
            value={filter.mode}
            onChange={(event) => set("mode", event.target.value as BoardFilter["mode"])}
            className="h-7 rounded-md border border-border bg-field px-2 text-xs outline-none"
          >
            <option value="any">Any section</option>
            <option value="all">All sections</option>
          </select>
        </label>

        <p className="text-xs text-muted-foreground/70">
          Showing {matchCount} of {totalCount} {totalCount === 1 ? "card" : "cards"}.
        </p>
      </div>
    </div>
  );
}
