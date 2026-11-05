"use client";

import * as React from "react";
import { FolderKanban } from "lucide-react";

import { CONTRACT_TYPE_LABELS } from "@/lib/contract-rules";
import {
  byNumber,
  byText,
  Chip,
  Collection,
  Fact,
  RecordMenu,
  RecordRow,
  RecordRowSkeleton,
  useList,
  type FacetDef,
  type SortDef,
} from "@/next-ui/blocks";
import { useProjects, type ProjectRow } from "@/next-ui/data/projects";
import { useNow } from "@/next-ui/hooks/use-now";
import { hrefFromEntry } from "@/next-ui/panes";
import { FilterBar } from "@/next-ui/patterns/filter-bar";
import { PageHeader } from "@/next-ui/patterns/page-header";
import { ProjectAvatar } from "@/next-ui/patterns/project-avatar";
import { StatusBadge } from "@/next-ui/patterns/status-badge";

import { daysText, projectStanding, STATE_LABEL, type ProjectStanding } from "./project-state";

type Row = ProjectRow & { standing: ProjectStanding };

const FACETS: FacetDef<Row>[] = [
  { id: "team", label: "Team", value: (p) => p.team?.name ?? null },
  {
    id: "contract",
    label: "Contract",
    value: (p) => p.standing.contract?.contractType ?? null,
    format: (v) => CONTRACT_TYPE_LABELS[v as keyof typeof CONTRACT_TYPE_LABELS] ?? v,
  },
];

const SORTS: SortDef<Row>[] = [
  { id: "newest", label: "Newest", compare: byNumber((p) => new Date(p.createdAt).getTime()) },
  { id: "name", label: "Name", compare: byText((p) => p.name) },
  { id: "ending", label: "Ending soon", compare: byNumber((p) => (p.standing.state === "active" ? p.standing.days : null), false) },
  { id: "tasks", label: "Most tasks", compare: byNumber((p) => p._count.tasks) },
];

/** The list's scope pills: the live panel's split between active projects and the archive. */
const SCOPES = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "archive", label: "Archive" },
];

const searchText = (p: Row) =>
  [p.name, p.description, p.team?.name, ...p.contracts.flatMap((c) => [c.code, c.label])].filter(Boolean).join(" ");

/**
 * Projects: one row per project the reader belongs to (every project for admins), as
 * `getProjects` returns them. The row says where the project stands (active with the days
 * left, late payment, upcoming, archived), its team, its contract type and its size. A click
 * opens the project; its ⋯ opens it beside the list.
 */
export function ProjectsScreen() {
  const projects = useProjects();
  const now = useNow();
  const [scope, setScope] = React.useState("all");

  const rows = React.useMemo<Row[] | undefined>(
    () => projects.data?.map((p) => ({ ...p, standing: projectStanding(p.contracts, now) })),
    [projects.data, now],
  );
  const scoped = React.useMemo(() => {
    if (!rows || scope === "all") return rows;
    return rows.filter((p) => (scope === "active" ? p.standing.state === "active" : p.standing.state !== "active"));
  }, [rows, scope]);
  const list = useList(scoped, { searchText, facets: FACETS, sorts: SORTS, defaultSort: "newest" });
  const isFiltered = list.isFiltered || scope !== "all";

  return (
    <>
      <PageHeader title="Projects" />

      <FilterBar
        search={list.query.search}
        onSearch={list.setSearch}
        placeholder="Search projects…"
        sorts={SORTS}
        sort={list.query.sort ?? "newest"}
        onSort={list.setSort}
        types={SCOPES}
        type={scope}
        onType={setScope}
        typeLabel="Show"
        facets={list.facets}
        isFiltered={isFiltered}
        onReset={() => {
          list.reset();
          setScope("all");
        }}
      />

      <Collection
        layout="rows"
        items={list.rows}
        total={rows?.length}
        isFiltered={isFiltered}
        isPending={projects.isPending}
        error={projects.error}
        noun="projects"
        getKey={(p) => p.id}
        skeleton={<RecordRowSkeleton />}
        testId="projects-list"
        empty={{
          icon: FolderKanban,
          title: "No projects yet",
          description: "Projects you are a member of appear here.",
        }}
        render={(p) => <ProjectRowItem project={p} />}
      />
    </>
  );
}

function ProjectRowItem({ project: p }: { project: Row }) {
  const href = hrefFromEntry({ kind: "project", id: p.id });
  const days = daysText(p.standing);
  const type = p.standing.contract ? CONTRACT_TYPE_LABELS[p.standing.contract.contractType] : null;
  return (
    <RecordRow
      href={href}
      muted={p.standing.state === "archived"}
      leading={<ProjectAvatar name={p.name} logoUrl={p.logoUrl} className="size-10" />}
      title={p.name}
      description={p.description || undefined}
      meta={
        <>
          <StatusBadge status={p.standing.state} label={STATE_LABEL[p.standing.state]} />
          {days && <Fact>{days}</Fact>}
          {p.team && <Chip title={p.team.name}>{p.team.name}</Chip>}
          {type && <Chip variant="secondary">{type}</Chip>}
          <Fact label="Members">{p._count.members}</Fact>
          <Fact label="Tasks">{p._count.tasks}</Fact>
        </>
      }
      menu={<RecordMenu href={href} />}
    />
  );
}
