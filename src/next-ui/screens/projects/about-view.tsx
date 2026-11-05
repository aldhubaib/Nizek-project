"use client";

import { ListChecks, Paperclip, StickyNote, Users } from "lucide-react";

import { CONTRACT_TYPE_LABELS } from "@/lib/contract-rules";
import { Chip, DetailSection, Fact, HeaderCard, RecordRow, type HeaderStat } from "@/next-ui/blocks";
import type { ProjectDetail } from "@/next-ui/data/projects";
import { ProjectAvatar } from "@/next-ui/patterns/project-avatar";
import { StatusBadge } from "@/next-ui/patterns/status-badge";

import { contractDates, contractName, contractState, daysText, projectStanding, STATE_LABEL } from "./project-state";

/**
 * The project's About: its header card (logo, name, team, where it stands, size) and its
 * contracts. A small dashboard of the project will grow here later.
 */
export function AboutView({ project: p, now }: { project: ProjectDetail; now: Date }) {
  const standing = projectStanding(p.contracts, now);
  const stats: HeaderStat[] = [
    { icon: Users, value: p.members.length, label: "members" },
    { icon: ListChecks, value: p._count.tasks, label: "tasks" },
    { icon: StickyNote, value: p._count.meetingNotes, label: "notes" },
    { icon: Paperclip, value: p._count.assets, label: "assets" },
  ];
  const days = daysText(standing);

  return (
    <div className="flex flex-col gap-6">
      <HeaderCard
        avatar={<ProjectAvatar name={p.name} logoUrl={p.logoUrl} />}
        title={p.name}
        badge={<StatusBadge status={standing.state} label={STATE_LABEL[standing.state]} />}
        handles={
          <>
            {p.team && <span>{p.team.name}</span>}
            {standing.contract && <span>{CONTRACT_TYPE_LABELS[standing.contract.contractType]}</span>}
          </>
        }
        description={p.description || undefined}
        stats={stats}
        status={
          standing.contract ? (
            <>
              <span>{contractName(standing.contract)}</span>
              <span aria-hidden>·</span>
              <span>{contractDates(standing.contract)}</span>
              {days && (
                <>
                  <span aria-hidden>·</span>
                  <span>{days}</span>
                </>
              )}
            </>
          ) : (
            <span>No current contract</span>
          )
        }
      />

      <DetailSection title="Contracts" meta={p.contracts.length}>
        {p.contracts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No contracts yet.</p>
        ) : (
          <div className="flex flex-col gap-2" role="list">
            {p.contracts.map((c) => (
              <ContractRow key={c.id} contract={c} now={now} />
            ))}
          </div>
        )}
      </DetailSection>
    </div>
  );
}

function ContractRow({ contract: c, now }: { contract: ProjectDetail["contracts"][number]; now: Date }) {
  const state = contractState(c, now);
  // the one contract's own standing gives "57 days left" / "Starts in 12 days"; nothing for an ended one
  const days = state === "expired" ? null : daysText(projectStanding([c], now));
  return (
    <RecordRow
      title={contractName(c)}
      description={contractDates(c)}
      muted={state === "expired"}
      meta={
        <>
          <StatusBadge status={state} label={state === "late" ? "Late payment" : state} />
          {days && <Fact>{days}</Fact>}
          <Chip variant="secondary">{CONTRACT_TYPE_LABELS[c.contractType]}</Chip>
          {c.code && c.label && <Fact>{c.code}</Fact>}
        </>
      }
    />
  );
}
