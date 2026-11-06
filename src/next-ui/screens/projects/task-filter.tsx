"use client";

import * as React from "react";
import { UserRoundX } from "lucide-react";

import { TASK_TYPE_LABEL, taskCode, taskTypeLabel } from "@/lib/task-label";
import type { TaskRow } from "@/next-ui/data/tasks";
import { filterGroup, optionsOf, usePageFilters, type FilterGroup, type FilterOption } from "@/next-ui/patterns/filter-menu";

import { TaskTypeIcon } from "./task-marks";

const TYPE_ORDER = Object.keys(TASK_TYPE_LABEL);
/** The assignee value of a task nobody holds. */
const NOBODY = "nobody";

export interface TaskFilter {
  /** The Filter menu's groups: the task type, then who holds the task. */
  groups: FilterGroup[];
  search: string;
  setSearch: (s: string) => void;
  /** The tasks that get through the search and the filter, in their order. */
  tasks: TaskRow[] | undefined;
  isFiltered: boolean;
}

/**
 * The search and the Filter menu of a board (the road map, the active sprint): tasks narrow to
 * one type and to one person's, and to those whose title or code holds the search. The filter
 * is kept for the session per project and board (`usePageFilters`); the search is not.
 */
export function useTaskFilter(page: string, all: TaskRow[] | undefined): TaskFilter {
  const filters = usePageFilters(page);
  const [search, setSearch] = React.useState("");
  const query = search.trim().toLowerCase();

  const groups = React.useMemo(() => {
    const people = new Map<string, string>();
    let nobody = false;
    for (const t of all ?? []) {
      if (t.assignee) people.set(t.assignee.id, t.assignee.name || "Unnamed");
      else nobody = true;
    }
    const holders: FilterOption[] = [...people].map(([id, name]) => ({ value: id, label: name })).sort((a, b) => a.label.localeCompare(b.label));
    if (nobody) holders.push({ value: NOBODY, label: "Unassigned", icon: <UserRoundX /> });
    return [
      filterGroup(
        filters,
        "type",
        optionsOf(all, (t) => t.taskType, (v) => ({ label: taskTypeLabel(v), icon: <TaskTypeIcon taskType={v} /> }), TYPE_ORDER),
      ),
      filterGroup(filters, "assignee", holders, "Assigned to"),
    ];
  }, [all, filters]);

  const tasks = React.useMemo(
    () =>
      all?.filter(
        (t) =>
          filters.passes("type", t.taskType) &&
          filters.passes("assignee", t.assignee?.id ?? NOBODY) &&
          (!query || t.title.toLowerCase().includes(query) || taskCode(t.taskType, t.taskNumber).toLowerCase().includes(query)),
      ),
    [all, filters, query],
  );

  return { groups, search, setSearch, tasks, isFiltered: filters.active || query !== "" };
}
