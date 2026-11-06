"use client";

import * as React from "react";
import { Archive, CircleAlert, CircleCheck, Clock, FolderKanban, type LucideIcon } from "lucide-react";

import { CONTRACT_TYPE_LABELS } from "@/lib/contract-rules";
import {
  byNumber,
  byText,
  Chip,
  Collection,
  Fact,
  RecordCard,
  RecordCardSkeleton,
  RecordMenu,
  RecordRow,
  RecordRowSkeleton,
  useList,
  type SortDef,
} from "@/next-ui/blocks";
import { useProjects, type ProjectRow } from "@/next-ui/data/projects";
import { useNow } from "@/next-ui/hooks/use-now";
import { hrefFromEntry } from "@/next-ui/panes";
import { filterGroup, optionsOf, usePageFilters } from "@/next-ui/patterns/filter-menu";
import { ListTools } from "@/next-ui/patterns/list-tools";
import { PageHeader } from "@/next-ui/patterns/page-header";
import { ProjectAvatar } from "@/next-ui/patterns/project-avatar";
import { StatusBadge } from "@/next-ui/patterns/status-badge";
import { usePageView } from "@/next-ui/patterns/view-menu";

import { daysText, projectStanding, STATE_LABEL, type ProjectStanding, type ProjectState } from "./project-state";

type Row = ProjectRow & { standing: ProjectStanding };

const SORTS: SortDef<Row>[] = [
  { id: "newest", label: "Newest", compare: byNumber((p) => new Date(p.createdAt).getTime()) },
  { id: "name", label: "Name", compare: byText((p) => p.name) },
  { id: "ending", label: "Ending soon", compare: byNumber((p) => (p.standing.state === "active" ? p.standing.days : null), false) },
  { id: "tasks", label: "Most tasks", compare: byNumber((p) => p._count.tasks) },
];

/** The standings a project can be in, in the order the Filter menu lists them, each with its mark. */
const STATES: { id: ProjectState; icon: LucideIcon }[] = [
  { id: "active", icon: CircleCheck },
  { id: "late", icon: CircleAlert },
  { id: "upcoming", icon: Clock },
  { id: "archived", icon: Archive },
];
const STATE_ORDER = STATES.map((s) => s.id);
const CONTRACT_ORDER = Object.keys(CONTRACT_TYPE_LABELS);

const searchText = (p: Row) =>
  [p.name, p.description, p.team?.name, ...p.contracts.flatMap((c) => [c.code, c.label])].filter(Boolean).join(" ");

/**
 * Projects: one per project the reader belongs to (every project for admins), as
 * `getProjects` returns them, as rows or as cards (the View menu). Each says where the project
 * stands (active with the days left, late payment, upcoming, archived), its team, its contract
 * type and its size. The Filter menu narrows by standing, team and contract type; the search
 * is in the pane header. A click opens the project; its ⋯ opens it beside the list.
 */
export function ProjectsScreen() {
  const projects = useProjects();
  const now = useNow();
  const filters = usePageFilters("projects");
  const view = usePageView("projects");

  const rows = React.useMemo<Row[] | undefined>(
    () => projects.data?.map((p) => ({ ...p, standing: projectStanding(p.contracts, now) })),
    [projects.data, now],
  );
  const groups = React.useMemo(
    () => [
      filterGroup(
        filters,
        "state",
        optionsOf(
          rows,
          (p) => p.standing.state,
          (v) => {
            const Icon = STATES.find((s) => s.id === v)?.icon ?? CircleCheck;
            return { label: STATE_LABEL[v as ProjectState] ?? v, icon: <Icon /> };
          },
          STATE_ORDER,
        ),
      ),
      filterGroup(
        filters,
        "team",
        optionsOf(rows, (p) => p.team?.name),
        "Team",
      ),
      filterGroup(
        filters,
        "contract",
        optionsOf(
          rows,
          (p) => p.standing.contract?.contractType,
          (v) => ({ label: CONTRACT_TYPE_LABELS[v as keyof typeof CONTRACT_TYPE_LABELS] ?? v }),
          CONTRACT_ORDER,
        ),
        "Contract",
      ),
    ],
    [rows, filters],
  );
  const scoped = React.useMemo(
    () =>
      rows?.filter(
        (p) =>
          filters.passes("state", p.standing.state) &&
          filters.passes("team", p.team?.name) &&
          filters.passes("contract", p.standing.contract?.contractType),
      ),
    [rows, filters],
  );
  const list = useList(scoped, { searchText, sorts: SORTS, defaultSort: "newest" });
  const isFiltered = list.isFiltered || filters.active;
  const clear = () => {
    list.reset();
    filters.clear();
  };

  return (
    <>
      <PageHeader title="Projects" />

      <ListTools
        what="projects"
        search={list.query.search}
        onSearch={list.setSearch}
        groups={groups}
        view={view}
        sorts={SORTS}
        sort={list.query.sort ?? "newest"}
        onSort={list.setSort}
      />

      <Collection
        layout={view.cards ? "grid" : "rows"}
        min={view.min}
        items={list.rows}
        total={rows?.length}
        isFiltered={isFiltered}
        onClearFilters={clear}
        isPending={projects.isPending}
        error={projects.error}
        noun="projects"
        getKey={(p) => p.id}
        skeleton={view.cards ? <RecordCardSkeleton /> : <RecordRowSkeleton />}
        testId="projects-list"
        empty={{
          icon: FolderKanban,
          title: "No projects yet",
          description: "Projects you are a member of appear here.",
        }}
        render={(p) => (view.cards ? <ProjectCardItem project={p} /> : <ProjectRowItem project={p} />)}
      />
    </>
  );
}

function ProjectMeta({ project: p }: { project: Row }) {
  const days = daysText(p.standing);
  const type = p.standing.contract ? CONTRACT_TYPE_LABELS[p.standing.contract.contractType] : null;
  return (
    <>
      <StatusBadge status={p.standing.state} label={STATE_LABEL[p.standing.state]} />
      {days && <Fact>{days}</Fact>}
      {p.team && <Chip title={p.team.name}>{p.team.name}</Chip>}
      {type && <Chip variant="secondary">{type}</Chip>}
      <Fact label="Members">{p._count.members}</Fact>
      <Fact label="Tasks">{p._count.tasks}</Fact>
    </>
  );
}

function ProjectRowItem({ project: p }: { project: Row }) {
  const href = hrefFromEntry({ kind: "project", id: p.id });
  return (
    <RecordRow
      href={href}
      muted={p.standing.state === "archived"}
      leading={<ProjectAvatar name={p.name} logoUrl={p.logoUrl} className="size-10" />}
      title={p.name}
      description={p.description || undefined}
      meta={<ProjectMeta project={p} />}
      menu={<RecordMenu href={href} />}
    />
  );
}

function ProjectCardItem({ project: p }: { project: Row }) {
  const href = hrefFromEntry({ kind: "project", id: p.id });
  return (
    <RecordCard
      href={href}
      muted={p.standing.state === "archived"}
      media={<ProjectAvatar name={p.name} logoUrl={p.logoUrl} className="size-16 text-xl" />}
      title={p.name}
      description={p.description || undefined}
      meta={<ProjectMeta project={p} />}
      menu={<RecordMenu href={href} />}
    />
  );
}
