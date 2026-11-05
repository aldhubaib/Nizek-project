"use client";

import * as React from "react";
import { format } from "date-fns";

import { DetailSection } from "@/next-ui/blocks";
import type { ProjectDetail } from "@/next-ui/data/projects";
import { ProjectAvatar } from "@/next-ui/patterns/project-avatar";

/**
 * The project's settings, read for now: what it is called, which team runs it, which systems
 * it uses (sprints, client chat), how it reviews work, and when it was made. Editing them
 * here is a later step.
 */
export function SettingsView({ project: p }: { project: ProjectDetail }) {
  // the review role or person is stored by id; the roster names it when it is on the project
  const reviewRole = p.internalReviewRoleId
    ? (p.members.find((m) => m.projectRole?.id === p.internalReviewRoleId)?.projectRole?.name ?? "A role")
    : null;
  const reviewUser = p.internalReviewUserId
    ? (p.members.find((m) => m.user.id === p.internalReviewUserId)?.user.name ?? "A person")
    : null;

  return (
    <div className="flex flex-col gap-6">
      <DetailSection title="General" className="border-t-0 pt-0" testId="settings-general">
        <dl>
          <FactRow label="Logo">
            <ProjectAvatar name={p.name} logoUrl={p.logoUrl} className="size-8" />
          </FactRow>
          <FactRow label="Name">{p.name}</FactRow>
          <FactRow label="Description">{p.description?.trim() || <Muted>None</Muted>}</FactRow>
          <FactRow label="Team">{p.team?.name ?? <Muted>No team</Muted>}</FactRow>
        </dl>
      </DetailSection>

      <DetailSection title="Ways of working" testId="settings-systems">
        <dl>
          <FactRow label="Sprints">{p.sprintsEnabled !== false ? "On" : "Off"}</FactRow>
          <FactRow label="Client chat">{p.clientChatEnabled ? "On" : "Off"}</FactRow>
          <FactRow label="Tasks in the pipeline at once">{p.maxPipelineTasks}</FactRow>
          <FactRow label="Internal review by">
            {reviewRole || reviewUser ? [reviewRole, reviewUser].filter(Boolean).join(" · ") : <Muted>Not set</Muted>}
          </FactRow>
        </dl>
      </DetailSection>

      <DetailSection title="Dates" testId="settings-dates">
        <dl>
          <FactRow label="Created">{format(new Date(p.createdAt), "d MMM yyyy")}</FactRow>
          <FactRow label="Last changed">{format(new Date(p.updatedAt), "d MMM yyyy")}</FactRow>
        </dl>
      </DetailSection>
    </div>
  );
}

function FactRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-6 border-b py-2.5 last:border-b-0">
      <dt className="shrink-0 text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-end text-sm break-words" dir="auto">
        {children}
      </dd>
    </div>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <span className="text-muted-foreground">{children}</span>;
}
